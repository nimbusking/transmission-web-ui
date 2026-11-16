// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../../src/stores/app';
vi.mock('../../src/i18n', () => ({ setLanguage: async () => {} }));
let app: ReturnType<typeof useAppStore>;
let rows: any[], calls: any[], failList: boolean;
let intercept: ((body: any) => Promise<Response> | undefined) | undefined;
const envelope = (body: any, args: any) =>
  Response.json({ result: 'success', arguments: args, tag: body.tag });
beforeEach(async () => {
  setActivePinia(createPinia());
  rows = [];
  calls = [];
  failList = false;
  intercept = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      const response = intercept?.(body);
      if (response) return response;
      if (body.method === 'session-get')
        return envelope(body, { version: '4.0.6', 'rpc-version': 17, 'session-id': 'session' });
      if (body.method === 'torrent-get') {
        if (failList) throw new TypeError('offline');
        const ids = body.arguments.ids;
        const selected = rows.filter(
          (row) => !Array.isArray(ids) || ids.includes(row.id) || ids.includes(row.hashString),
        );
        return envelope(body, {
          torrents: selected.map((row) =>
            Object.fromEntries(
              body.arguments.fields
                .filter((key: string) => key in row)
                .map((key: string) => [key, row[key]]),
            ),
          ),
        });
      }
      return envelope(body, {});
    }),
  );
  app = useAppStore();
  await app.initialize({
    rpcUrl: `http://localhost/rpc-${crypto.randomUUID()}`,
    defaultLocale: 'en',
    refreshIntervalMs: 5000,
  });
  await app.updateUi({ autoRefresh: false });
});
afterEach(() => {
  app.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('B01/B03/B10: empty startup works and failed refresh preserves cache and error text', async () => {
  expect(app.ready).toBe(true);
  expect(app.torrents).toEqual([]);
  rows = [{ id: 1, hashString: 'hash', downloadDir: '/data', error: 2, errorString: 'disk full' }];
  await app.refresh(true);
  failList = true;
  await expect(app.refresh()).rejects.toThrow('offline');
  expect(app.byId.get(1)?.errorString).toBe('disk full');
  expect(app.stale).toBe(true);
  failList = false;
  await app.refresh(true);
  expect(app.stale).toBe(false);
});
it('B08: coalesces overlapping refresh and follows a requested full reconciliation', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let active = 0,
    peak = 0,
    count = 0;
  intercept = (body) => {
    if (body.method !== 'torrent-get') return;
    count++;
    active++;
    peak = Math.max(peak, active);
    return gate.then(() => {
      active--;
      return envelope(body, { torrents: [] });
    });
  };
  const a = app.refresh(),
    b = app.refresh(true);
  expect(count).toBe(1);
  release();
  await Promise.all([a, b]);
  await vi.waitFor(() => expect(count).toBe(2));
  expect(peak).toBe(1);
});
it('B11: rejects empty targets and captured identity after reconnect or ID reuse', async () => {
  rows = [{ id: 1, hashString: 'first', downloadDir: '/data' }];
  await app.refresh(true);
  const frozen = app.targets([1]);
  expect(() => app.targets([])).toThrow();
  rows = [{ id: 1, hashString: 'second', downloadDir: '/data' }];
  await app.connect();
  const before = calls.length;
  await expect(
    app.command('torrent-remove', frozen, { 'delete-local-data': false }),
  ).rejects.toThrow('identity');
  await expect(app.command('torrent-stop', [])).rejects.toThrow();
  expect(calls.length).toBe(before);
});
it('B11: late detail response never overwrites the newly selected task', async () => {
  rows = [
    { id: 1, hashString: 'one', downloadDir: '/a' },
    { id: 2, hashString: 'two', downloadDir: '/b' },
  ];
  await app.refresh(true);
  let release!: () => void;
  intercept = (body) => {
    if (body.method !== 'torrent-get' || !body.arguments.ids) return;
    if (body.arguments.ids[0] === 'one')
      return new Promise((resolve) => {
        release = () =>
          resolve(envelope(body, { torrents: [{ id: 1, hashString: 'one', comment: 'late' }] }));
      });
    return Promise.resolve(
      envelope(body, { torrents: [{ id: 2, hashString: 'two', comment: 'current' }] }),
    );
  };
  app.select(1);
  app.select(2);
  await vi.waitFor(() => expect(app.detail?.id).toBe(2));
  release();
  await Promise.resolve();
  await Promise.resolve();
  expect(app.detail?.comment).toBe('current');
});
// D9/C11 explicitly supersedes the previous multi-step 3.00 mixed-edit contract.
it('3.00 mixed edits and group changes are rejected before the first modifying RPC', async () => {
  rows = [
    {
      id: 1,
      hashString: 'one',
      downloadDir: '/a',
      trackers: [
        { id: 0, announce: 'http://a/announce', tier: 0 },
        { id: 1, announce: 'http://b/announce', tier: 1 },
      ],
    },
  ];
  await app.refresh(true);
  app.session = { version: '3.00', 'rpc-version': 16 };
  for (const after of [
    [{ id: 1, announce: 'http://new/announce', tier: 1 }],
    rows[0].trackers.map((x: any) => ({ ...x, tier: 0 })),
  ]) {
    await expect(app.updateTrackers(app.targets([1])[0], rows[0].trackers, after)).rejects.toThrow(
      'restricted',
    );
  }
  expect(calls.filter((call) => call.method === 'torrent-set')).toHaveLength(0);
});
it('3.00 pure URL replacement reads back and never retries an uncertain write', async () => {
  rows = [
    {
      id: 1,
      hashString: 'one',
      downloadDir: '/a',
      trackers: [{ id: 0, announce: 'http://a/announce', tier: 0 }],
    },
  ];
  await app.refresh(true);
  app.session = { version: '3.00', 'rpc-version': 16 };
  intercept = (body) => {
    if (body.method !== 'torrent-set') return;
    rows[0].trackers[0].announce = body.arguments.trackerReplace[1];
    return Promise.reject(new TypeError('connection lost after write'));
  };
  await expect(
    app.updateTrackers(app.targets([1])[0], structuredClone(rows[0].trackers), [
      { id: 0, announce: 'http://new/announce', tier: 0 },
    ]),
  ).rejects.toThrow();
  expect(calls.filter((call) => call.method === 'torrent-set')).toHaveLength(1);
  expect(rows[0].trackers[0].announce).toBe('http://new/announce');
  expect(app.operationBusy).toBe(false);
});
it('B02: recently-active newcomers trigger base fill before target capture', async () => {
  intercept = (body) => {
    if (body.method !== 'torrent-get') return;
    return Promise.resolve(
      envelope(body, {
        torrents:
          body.arguments.ids === 'recently-active'
            ? [{ id: 7, rateDownload: 100 }]
            : [{ id: 7, hashString: 'new', downloadDir: '/base', name: 'new task' }],
      }),
    );
  };
  await app.refresh();
  expect(app.targets([7])[0].hashString).toBe('new');
  expect(app.byId.get(7)?.rateDownload).toBe(100);
});
it('C02/B05/B12: invalid metainfo settles, last successful label persists, defaults unchanged', async () => {
  app.settings = await app.repository!.update((v) => ({
    ...v,
    labels: [{ id: 'label', name: 'local', color: '#123456' }],
  }));
  intercept = (body) => {
    if (body.method !== 'torrent-add') return;
    return Promise.resolve(
      body.arguments.metainfo === 'bad'
        ? Response.json({ result: 'invalid metainfo', tag: body.tag })
        : envelope(body, { 'torrent-added': { hashString: 'added', id: 8 } }),
    );
  };
  const result = await app.addTasks(
    [
      { name: 'invalid', metainfo: 'bad' },
      { name: 'last', metainfo: 'valid' },
    ],
    { directory: '/once', paused: true, labels: ['label'], setDefault: false },
  );
  expect(result.items.map((x) => x.status)).toEqual(['failed', 'success']);
  expect((await app.repository!.load()).torrentLabels.added).toEqual(['label']);
  expect(calls.some((x) => x.method === 'session-set')).toBe(false);
});
it('active folder matching prevents conflicting ordinary writes to the same tasks', async () => {
  rows = [{ id: 1, hashString: 'one', downloadDir: '/a' }];
  await app.refresh(true);
  const target = app.targets([1])[0];
  app.matchJob = {
    id: 'job',
    createdAt: 0,
    candidates: ['/b'],
    running: true,
    cancelled: false,
    items: [
      {
        target,
        name: 'one',
        originalDir: '/a',
        currentDir: '/b',
        candidateIndex: 0,
        phase: 'waiting',
        progress: 0,
      },
    ],
  };
  await expect(app.command('torrent-start', [target])).rejects.toThrow('match is active');
  await expect(app.command('torrent-verify', [target], {}, true)).resolves.toEqual({});
});
it('daemon session change reconnects and invalidates the captured generation', async () => {
  rows = [{ id: 1, hashString: 'before', downloadDir: '/old' }];
  await app.refresh(true);
  const captured = app.targets([1]),
    generation = app.generation;
  app.checkedIds = [1];
  app.select(1);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);
  rows = [{ id: 1, hashString: 'after', downloadDir: '/new' }];
  intercept = (body) =>
    body.method === 'session-get'
      ? Promise.resolve(
          envelope(body, { version: '4.0.6', 'rpc-version': 17, 'session-id': 'new-session' }),
        )
      : undefined;
  await app.refresh();
  await vi.waitFor(() => {
    expect(app.ready).toBe(true);
    expect(app.byId.get(1)?.hashString).toBe('after');
  });
  expect(app.generation).toBe(generation + 1);
  expect(app.checkedIds).toEqual([]);
  expect(app.selectedId).toBeNull();
  await expect(app.command('torrent-stop', captured)).rejects.toThrow('identity');
});
it('early 4.0 full reconciliation removes tasks omitted by recently-active', async () => {
  rows = [{ id: 1, hashString: 'old', downloadDir: '/data' }];
  await app.refresh(true);
  app.session = { version: '4.0.0', 'rpc-version': 17 };
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16000);
  intercept = (body) =>
    body.method === 'torrent-get' ? Promise.resolve(envelope(body, { torrents: [] })) : undefined;
  await app.refresh();
  const lastRead = calls.filter((x) => x.method === 'torrent-get').at(-1);
  expect(lastRead.arguments.ids).toBeUndefined();
  expect(app.byId.size).toBe(0);
});
it('late snapshot from an aborted generation never replaces the new connection cache', async () => {
  let release!: () => void,
    delayed = true;
  intercept = (body) => {
    if (body.method !== 'torrent-get' || !delayed) return;
    delayed = false;
    return new Promise((resolve) => {
      release = () =>
        resolve(
          envelope(body, { torrents: [{ id: 9, hashString: 'stale', downloadDir: '/stale' }] }),
        );
    });
  };
  const old = app.refresh(true);
  rows = [{ id: 2, hashString: 'current', downloadDir: '/current' }];
  await app.connect();
  release();
  await old;
  expect(app.torrents.map((x) => x.hashString)).toEqual(['current']);
  expect(app.ready).toBe(true);
});
it('duplicates use an explicit result and missing identity never changes an arbitrary label mapping', async () => {
  app.settings = await app.repository!.update((v) => ({
    ...v,
    labels: [{ id: 'label', name: 'local', color: '#123456' }],
  }));
  intercept = (body) =>
    body.method === 'torrent-add'
      ? Promise.resolve(
          body.arguments.metainfo === 'early4'
            ? Response.json({ result: 'duplicate torrent', tag: body.tag })
            : envelope(body, { 'torrent-duplicate': { id: 1, hashString: 'existing' } }),
        )
      : undefined;
  const result = await app.addTasks(
    [
      { name: 'early4', metainfo: 'early4' },
      { name: 'known', metainfo: 'known' },
    ],
    { directory: '', paused: true, labels: ['label'], setDefault: false },
  );
  expect(result.items.map((x) => x.status)).toEqual(['duplicate', 'duplicate']);
  expect(result.items[0].message).toContain('not changed');
  expect((await app.repository!.load()).torrentLabels).toEqual({ existing: ['label'] });
});
it('saved running workflow becomes interrupted without replay; explicit resume reconciles the new task ID', async () => {
  const runtime = app.config!;
  await app.saveJob({
    id: 'saved',
    createdAt: 1,
    candidates: ['/candidate'],
    running: true,
    cancelled: false,
    items: [
      {
        target: { id: 1, hashString: 'survives', generation: 99 },
        name: 'saved task',
        originalDir: '/original',
        currentDir: '/original',
        candidateIndex: 0,
        phase: 'waiting',
        progress: 0,
      },
    ],
  });
  app.dispose();
  setActivePinia(createPinia());
  rows = [
    {
      id: 2,
      hashString: 'survives',
      downloadDir: '/original',
      name: 'saved task',
      status: 0,
      metadataPercentComplete: 1,
      files: [{ name: 'a', length: 1, bytesCompleted: 1 }],
    },
  ];
  app = useAppStore();
  await app.initialize(runtime);
  await app.updateUi({ autoRefresh: false });
  expect(app.matchJob?.running).toBe(false);
  expect(app.matchJob?.items[0].phase).toBe('interrupted');
  expect(
    calls.filter((x) => ['torrent-verify', 'torrent-set-location'].includes(x.method)),
  ).toHaveLength(0);
  intercept = (body) => {
    if (body.method === 'torrent-set-location') rows[0].downloadDir = body.arguments.location;
    return undefined;
  };
  const { resumeMatch } = await import('../../src/services/match-controller');
  await resumeMatch();
  expect(app.matchJob?.items[0].target.id).toBe(2);
  expect(app.matchJob?.items[0].phase).toBe('matched');
  expect(calls.filter((x) => x.method === 'torrent-set-location')[0].arguments.ids).toEqual([
    'survives',
  ]);
});
it('batch cancellation stops future commands while allowing the submitted item to settle', async () => {
  rows = [1, 2, 3].map((id) => ({ id, hashString: String(id), downloadDir: '/data' }));
  await app.refresh(true);
  let release!: () => void;
  intercept = (body) =>
    body.method === 'torrent-verify'
      ? new Promise((resolve) => {
          release = () => resolve(envelope(body, {}));
        })
      : undefined;
  const result = app.execute('torrent-verify', app.targets([1, 2, 3]));
  app.cancelOperations();
  release();
  expect((await result).items.map((item) => item.status)).toEqual([
    'success',
    'cancelled',
    'cancelled',
  ]);
  expect(calls.filter((call) => call.method === 'torrent-verify')).toHaveLength(1);
  expect(app.operationBusy).toBe(false);
});
it('statistics retain stale values on failure and clear across reconnect generations', async () => {
  intercept = (body) =>
    body.method === 'session-stats'
      ? Promise.resolve(envelope(body, { 'current-stats': { uploadedBytes: 42 } }))
      : undefined;
  await app.refresh(true);
  expect(app.stats['current-stats']?.uploadedBytes).toBe(42);
  failList = true;
  await expect(app.refresh()).rejects.toThrow();
  expect(app.stale).toBe(true);
  expect(app.stats['current-stats']?.uploadedBytes).toBe(42);
  let release!: () => void;
  intercept = (body) =>
    body.method === 'session-get'
      ? new Promise((resolve) => {
          release = () =>
            resolve(envelope(body, { version: '4.1.4', 'rpc-version': 19, 'session-id': 'new' }));
        })
      : undefined;
  const reconnect = app.connect();
  expect(app.stats).toEqual({});
  failList = false;
  release();
  await reconnect;
});
it('closing details cancels its loading state and rejects late data without clearing checked tasks', async () => {
  rows = [{ id: 1, hashString: 'a', name: 'Detail', downloadDir: '/data' }];
  await app.refresh(true);
  app.checkedIds = [1];
  let release!: () => void;
  intercept = (body) =>
    body.method === 'torrent-get' && body.arguments.fields.includes('pieces')
      ? new Promise((resolve) => {
          release = () =>
            resolve(envelope(body, { torrents: [{ ...rows[0], pieces: '////', pieceCount: 24 }] }));
        })
      : undefined;
  app.select(1);
  expect(app.detailLoading).toBe(true);
  app.select(null);
  expect(app.detailLoading).toBe(false);
  expect(app.checkedIds).toEqual([1]);
  expect(app.detail).toBeUndefined();
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(app.selectedId).toBeNull();
  expect(app.detail).toBeUndefined();
  expect(app.detailLoading).toBe(false);
});

it('automatic refresh really polls, honors off/foreground, interval changes and manual refresh', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const lists = () => calls.filter((b) => b.method === 'torrent-get').length;
  let count = lists();
  await app.updateUi({ autoRefresh: true, refreshIntervalMs: 2000 });
  await vi.advanceTimersByTimeAsync(1999);
  expect(lists()).toBe(count);
  await vi.advanceTimersByTimeAsync(1);
  expect(lists()).toBe(++count);
  await app.updateUi({ autoRefresh: false });
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(lists()).toBe(count);
  await app.refresh(true);
  expect(lists()).toBe(++count);
  await app.updateUi({ autoRefresh: true, refreshIntervalMs: 4000 });
  await vi.advanceTimersByTimeAsync(3999);
  expect(lists()).toBe(count);
  await vi.advanceTimersByTimeAsync(1);
  expect(lists()).toBe(++count);
  for (let i = 0; i < 3; i++) {
    await app.updateUi({ autoRefresh: false });
    await app.updateUi({ autoRefresh: true });
  }
  await vi.advanceTimersByTimeAsync(4000);
  expect(lists()).toBe(++count);
});
it('automatic refresh uses background cadence and recovers after failed polling', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  let hidden = true;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const lists = () => calls.filter((b) => b.method === 'torrent-get').length;
  let count = lists();
  await app.updateUi({ autoRefresh: true, refreshIntervalMs: 2000 });
  await vi.advanceTimersByTimeAsync(29999);
  expect(lists()).toBe(count);
  failList = true;
  await vi.advanceTimersByTimeAsync(1);
  expect(lists()).toBe(++count);
  expect(app.stale).toBe(true);
  failList = false;
  await vi.advanceTimersByTimeAsync(30000);
  expect(lists()).toBe(++count);
  expect(app.stale).toBe(false);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(lists()).toBe(++count);
  await vi.advanceTimersByTimeAsync(2000);
  expect(lists()).toBe(++count);
});
it('turning polling off or disposing during an in-flight tick never resurrects timers', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let release!: () => void;
  intercept = (b) =>
    b.method === 'torrent-get'
      ? new Promise((resolve) => {
          release = () => resolve(envelope(b, { torrents: [] }));
        })
      : undefined;
  const lists = () => calls.filter((b) => b.method === 'torrent-get').length;
  let count = lists();
  await app.updateUi({ autoRefresh: true, refreshIntervalMs: 2000 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(lists()).toBe(++count);
  await app.updateUi({ autoRefresh: false });
  release();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(10000);
  expect(lists()).toBe(count);
  await app.updateUi({ autoRefresh: true });
  await vi.advanceTimersByTimeAsync(2000);
  expect(lists()).toBe(++count);
  const epoch = app.generation;
  app.dispose();
  release();
  await vi.advanceTimersByTimeAsync(0);
  document.dispatchEvent(new Event('visibilitychange'));
  await app.refresh(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(lists()).toBe(count);
  expect(app.generation).toBeGreaterThan(epoch);
  expect(vi.getTimerCount()).toBe(0);
});
it('global scope snapshot waits for polling and deferred reconciliation before a fresh full read', async () => {
  let release!: () => void;
  let reads = 0,
    completed = 0;
  intercept = (body) => {
    if (body.method !== 'torrent-get') return;
    reads++;
    if (reads === 1)
      return new Promise((resolve) => {
        release = () => {
          completed++;
          resolve(envelope(body, { torrents: [] }));
        };
      });
    completed++;
    return Promise.resolve(envelope(body, { torrents: [] }));
  };
  const polling = app.refresh(),
    queued = app.refresh(true),
    snapshot = app.refreshSnapshot();
  expect(reads).toBe(1);
  release();
  await Promise.all([polling, queued, snapshot]);
  expect(completed).toBe(reads);
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(calls.filter((b) => b.method === 'torrent-get').at(-1).arguments.ids).toBeUndefined();
});

it('statusbar reads daemon-wide nonzero speeds and real default-directory bytes, preserving zero', async () => {
  app.session!['download-dir'] = '/data/default';
  let bytes = 123456789;
  intercept = (body) => {
    if (body.method === 'session-stats')
      return Promise.resolve(envelope(body, { downloadSpeed: 4096, uploadSpeed: 2048 }));
    if (body.method === 'free-space') {
      expect(body.arguments).toEqual({ path: '/data/default' });
      return Promise.resolve(envelope(body, { 'size-bytes': bytes }));
    }
  };
  await app.refresh();
  expect(app.stats).toEqual({ downloadSpeed: 4096, uploadSpeed: 2048 });
  expect(app.freeSpace).toEqual({ path: '/data/default', bytes });
  bytes = 0;
  await app.refresh();
  expect(app.freeSpace.bytes).toBe(0);
  for (bytes of [-1, NaN, Infinity]) {
    await app.refresh();
    expect(app.freeSpace.bytes).toBeUndefined();
  }
});
it('space failure clears obsolete directory value without failing healthy speeds/list, then recovers', async () => {
  app.session!['download-dir'] = '/a';
  let fail = false;
  intercept = (body) => {
    if (body.method === 'free-space')
      return fail
        ? Promise.reject(new Error('path denied'))
        : Promise.resolve(envelope(body, { 'size-bytes': 12 }));
  };
  await app.refresh();
  expect(app.freeSpace.bytes).toBe(12);
  fail = true;
  app.session!['download-dir'] = '/b';
  await app.refresh();
  expect(app.freeSpace).toEqual({ path: '/b', error: 'path denied' });
  expect(app.stale).toBe(false);
  fail = false;
  await app.refresh();
  expect(app.freeSpace).toEqual({ path: '/b', bytes: 12 });
});
it('reconnect clears disk/stat snapshots and rejects late disk responses from a prior generation', async () => {
  app.session!['download-dir'] = '/a';
  let release!: () => void;
  intercept = (body) =>
    body.method === 'free-space'
      ? new Promise((resolve) => {
          release = () => resolve(envelope(body, { 'size-bytes': 99 }));
        })
      : undefined;
  const old = app.refresh();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  await app.connect();
  expect(app.freeSpace).toEqual({ path: '' });
  release();
  await old;
  expect(app.freeSpace).toEqual({ path: '' });
});
it('space result for a path changed during the read cannot populate the new path', async () => {
  app.session!['download-dir'] = '/old';
  intercept = (body) => {
    if (body.method !== 'free-space') return;
    app.session!['download-dir'] = '/new';
    return Promise.resolve(envelope(body, { 'size-bytes': 99 }));
  };
  await app.refresh();
  expect(app.freeSpace.bytes).toBeUndefined();
});
it('a slow disk query times out independently and does not disconnect valid transfer statistics', async () => {
  app.session!['download-dir'] = '/data';
  vi.useFakeTimers();
  intercept = (body) => {
    if (body.method === 'session-stats')
      return Promise.resolve(envelope(body, { downloadSpeed: 42 }));
    return undefined;
  };
  const original = globalThis.fetch;
  vi.stubGlobal('fetch', (url: any, options: any) => {
    const body = JSON.parse(options.body);
    if (body.method !== 'free-space') return original(url, options);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () =>
        reject(new DOMException('timeout', 'AbortError')),
      );
    });
  });
  const reading = app.refresh();
  await vi.advanceTimersByTimeAsync(5001);
  await reading;
  expect(app.freeSpace.bytes).toBeUndefined();
  expect(app.freeSpace.error).toBeTruthy();
  expect(app.stats.downloadSpeed).toBe(42);
  expect(app.stale).toBe(false);
});

it('selection is captured at click; ID reuse invalidates only the changed identity before any write', async () => {
  rows = [
    {
      id: 1,
      hashString: 'old',
      downloadDir: '/private',
      trackers: [{ id: 0, announce: 'http://old', tier: 0 }],
    },
    { id: 2, hashString: 'stable', downloadDir: '/b' },
  ];
  await app.refresh(true);
  app.setCheckedIds([1, 2]);
  const frozen = app.captureCheckedTargets();
  app.select(1);
  rows = [
    { id: 1, hashString: 'new', name: 'replacement' },
    { id: 2, hashString: 'stable', downloadDir: '/b', name: 'renamed' },
  ];
  await app.refresh();
  expect(app.checkedIds).toEqual([2]);
  expect(app.captureCheckedTargets()).toEqual([frozen[1]]);
  expect(app.selectedId).toBeNull();
  expect(app.byId.get(1)?.downloadDir).toBeUndefined();
  expect(app.byId.get(1)?.trackers).toBeUndefined();
  const before = calls.length;
  await expect(app.command('torrent-stop', frozen)).rejects.toThrow('identity');
  expect(calls.length).toBe(before);
});
it('missing requested hash invalidates old selection even if bounded base fill restores identity', async () => {
  rows = [{ id: 1, hashString: 'one', downloadDir: '/a' }];
  await app.refresh(true);
  app.setCheckedIds([1]);
  intercept = (body) =>
    body.method === 'torrent-get' && body.arguments.ids === 'recently-active'
      ? Promise.resolve(envelope(body, { torrents: [{ id: 1, name: 'partial' }] }))
      : undefined;
  await app.refresh();
  expect(app.checkedIds).toEqual([]);
  expect(app.byId.get(1)?.hashString).toBe('one');
});
it('late details for reused numeric ID cannot populate the replacement task', async () => {
  rows = [{ id: 1, hashString: 'old', downloadDir: '/a' }];
  await app.refresh(true);
  let release!: () => void;
  intercept = (body) =>
    body.method === 'torrent-get' && body.arguments.fields.includes('pieces')
      ? new Promise((resolve) => {
          release = () =>
            resolve(envelope(body, { torrents: [{ id: 1, hashString: 'old', pieces: 'AAAA' }] }));
        })
      : undefined;
  app.select(1);
  expect(calls.at(-1).arguments.ids).toEqual(['old']);
  rows = [{ id: 1, hashString: 'new', downloadDir: '/b' }];
  await app.refresh();
  release();
  await Promise.resolve();
  await Promise.resolve();
  expect(app.selectedId).toBeNull();
  expect(app.detail).toBeUndefined();
});
it('base response is discarded when its captured row revision has changed', async () => {
  let release!: () => void;
  intercept = (body) => {
    if (body.method !== 'torrent-get') return;
    if (body.arguments.ids === 'recently-active')
      return Promise.resolve(envelope(body, { torrents: [{ id: 1, hashString: 'old' }] }));
    expect(body.arguments.ids).toEqual(['old']);
    return new Promise((resolve) => {
      release = () =>
        resolve(envelope(body, { torrents: [{ id: 1, hashString: 'old', downloadDir: '/old' }] }));
    });
  };
  const reading = app.refresh();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  app.byId.set(1, { id: 1, hashString: 'new', downloadDir: '/new' });
  release();
  await reading;
  expect(app.byId.get(1)?.hashString).toBe('new');
  expect(app.byId.get(1)?.downloadDir).toBe('/new');
});

async function limitSetup() {
  rows = [1, 2].map((id) => ({
    id,
    hashString: String(id),
    downloadDir: '/data',
    downloadLimited: true,
    downloadLimit: 123,
    uploadLimited: false,
    uploadLimit: 456,
  }));
  await app.refresh(true);
  return app.targets([1, 2]).map((target, i) => ({ target, row: structuredClone(rows[i]) }));
}
const downloadIntent = {
  download: { mode: 'limit' as const, value: 321 },
  upload: { mode: 'keep' as const, value: null },
};
it('limits preflight the whole batch before writing and ignore untouched upload changes', async () => {
  const baselines = await limitSetup();
  rows[1].downloadLimit = 99;
  await expect(app.saveLimits(baselines, downloadIntent)).rejects.toThrow('changed');
  expect(calls.filter((b) => b.method === 'torrent-set')).toHaveLength(0);
  rows[1].downloadLimit = 123;
  rows[0].uploadLimit = 789;
  intercept = (b) => {
    if (b.method === 'torrent-set')
      Object.assign(
        rows.find((r) => b.arguments.ids.includes(r.hashString)),
        b.arguments,
      );
    return undefined;
  };
  const result = await app.saveLimits(baselines, downloadIntent);
  expect(result.items.map((x) => x.status)).toEqual(['success', 'success']);
  expect(calls.filter((b) => b.method === 'torrent-set').map((b) => b.arguments)).toEqual([
    { ids: ['1'], downloadLimit: 321 },
    { ids: ['2'], downloadLimit: 321 },
  ]);
  expect(rows[0].uploadLimit).toBe(789);
});
it('limits distinguish readback mismatch, read failure, no-op and pending cancellation', async () => {
  const baseline = await limitSetup();
  const mismatch = await app.saveLimits([baseline[0]], downloadIntent);
  expect(mismatch.items[0].status).toBe('failed');
  let written = false;
  intercept = (b) => {
    if (b.method === 'torrent-set') {
      written = true;
      app.cancelOperations();
    }
    if (written && b.method === 'torrent-get') return Promise.reject(new TypeError('offline'));
    return undefined;
  };
  const result = await app.saveLimits(baseline, downloadIntent);
  expect(result.items.map((x) => x.status)).toEqual(['unknown', 'cancelled']);
  intercept = undefined;
  rows[0].downloadLimit = 321;
  expect((await app.saveLimits([baseline[0]], downloadIntent)).items[0].status).toBe('skipped');
});
it('preflight owns the busy token and old generation cannot unlock a new operation', async () => {
  const baseline = await limitSetup();
  let release!: () => void;
  intercept = (b) =>
    b.method === 'torrent-get' && b.arguments.fields.includes('downloadLimit')
      ? new Promise((resolve) => {
          release = () => resolve(envelope(b, { torrents: rows }));
        })
      : undefined;
  const old = app.saveLimits(baseline, downloadIntent);
  const oldFailure = expect(old).rejects.toThrow();
  expect(app.operationBusy).toBe(true);
  await expect(app.command('torrent-stop', [baseline[0].target])).rejects.toThrow('batch');
  intercept = undefined;
  await app.connect();
  let releaseNew!: () => void;
  intercept = (b) =>
    b.method === 'torrent-stop'
      ? new Promise((resolve) => {
          releaseNew = () => resolve(envelope(b, {}));
        })
      : undefined;
  const next = app.execute('torrent-stop', app.targets([1]));
  release();
  await oldFailure;
  expect(app.operationBusy).toBe(true);
  releaseNew();
  await next;
  expect(app.operationBusy).toBe(false);
});
it('Tracker ID/tier changes block overwrite, scrape updates do not, readback is mandatory', async () => {
  rows = [
    {
      id: 1,
      hashString: 'one',
      downloadDir: '/a',
      trackers: [
        { id: 0, announce: 'http://a/announce', tier: 0 },
        { id: 1, announce: 'http://b/announce', tier: 1 },
      ],
    },
  ];
  await app.refresh(true);
  const target = app.targets([1])[0],
    before = structuredClone(rows[0].trackers),
    after = before.map((x: any) => ({ ...x, tier: 0 }));
  rows[0].trackers[0].id = 9;
  await expect(app.updateTrackers(target, before, after)).rejects.toThrow('changed');
  expect(calls.filter((b) => b.method === 'torrent-set')).toHaveLength(0);
  rows[0].trackers = before.map((x: any) => ({ ...x, seederCount: 20 }));
  intercept = (b) => {
    if (b.method === 'torrent-set')
      rows[0].trackers = after.map((x: any) => ({ ...x, id: x.id + 10 }));
    return undefined;
  };
  expect((await app.updateTrackers(target, before, after)).status).toBe('success');
});

it('an observed removal invalidates frozen windows even if the same hash and numeric ID return', async () => {
  rows = [{ id: 1, hashString: 'same', downloadDir: '/data' }];
  await app.refresh(true);
  app.setCheckedIds([1]);
  const frozen = app.captureCheckedTargets().map((x) => ({ ...x }));
  rows = [];
  await app.refresh(true);
  rows = [{ id: 1, hashString: 'same', downloadDir: '/data' }];
  await app.refresh(true);
  await expect(app.command('torrent-stop', frozen)).rejects.toThrow('identity');
  expect(app.checkedIds).toEqual([]);
  expect(calls.filter((b) => b.method === 'torrent-stop')).toHaveLength(0);
});
it('capabilities are recomputed per connection and a temporary failure never persists a downgrade', async () => {
  expect(app.trackerCapability.state).toBe('full');
  app.session = { version: '3.00', 'rpc-version': 16 };
  expect(app.trackerCapability.state).toBe('url-only');
  failList = true;
  await expect(app.refresh()).rejects.toThrow();
  expect(app.trackerCapability.state).toBe('url-only');
  failList = false;
  const old = app.generation;
  await app.connect();
  expect(app.trackerCapability).toEqual({ generation: old + 1, state: 'full' });
});

it('returns to login on expired authentication and only resumes after successful credentials', async () => {
  intercept = () => Promise.resolve(new Response('', { status: 401 }));
  await expect(app.refresh(true)).rejects.toMatchObject({ kind: 'auth' });
  expect(app.authenticationRequired).toBe(true);
  expect(app.ready).toBe(false);
  const count = calls.length;
  await app.refresh();
  expect(calls).toHaveLength(count);
  await app.connect('user', 'wrong');
  expect(app.authenticationRequired).toBe(true);
  expect(app.ready).toBe(false);
  intercept = undefined;
  await app.connect('user', 'correct');
  expect(app.authenticationRequired).toBe(false);
  expect(app.ready).toBe(true);
  expect(app.error).toBe('');
});
