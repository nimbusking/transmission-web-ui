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
        return envelope(body, { torrents: rows });
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
    if (body.arguments.ids[0] === 1)
      return new Promise((resolve) => {
        release = () => resolve(envelope(body, { torrents: [{ id: 1, comment: 'late' }] }));
      });
    return Promise.resolve(envelope(body, { torrents: [{ id: 2, comment: 'current' }] }));
  };
  app.select(1);
  app.select(2);
  await vi.waitFor(() => expect(app.detail?.id).toBe(2));
  release();
  await Promise.resolve();
  await Promise.resolve();
  expect(app.detail?.comment).toBe('current');
});
it('3.00 uses flat Tracker replacement before removal renumbers positions', async () => {
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
  await app.updateTrackers(
    app.targets([1])[0],
    ['http://a/announce', 'http://b/announce'],
    [{ id: 1, announce: 'http://new/announce', tier: 1 }],
  );
  const writes = calls.filter((x) => x.method === 'torrent-set').map((x) => x.arguments);
  expect(writes).toEqual([
    { ids: ['one'], trackerReplace: [1, 'http://new/announce'] },
    { ids: ['one'], trackerRemove: [0] },
  ]);
});
it('3.00 reconciles a partially committed Tracker update without retrying the failed write', async () => {
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
  intercept = (body) => {
    if (body.method !== 'torrent-set') return;
    if (body.arguments.trackerReplace) {
      rows[0].trackers[1].announce = 'http://new/announce';
      return Promise.resolve(envelope(body, {}));
    }
    return Promise.resolve(Response.json({ result: 'remove rejected', tag: body.tag }));
  };
  const before = calls.length;
  await expect(
    app.updateTrackers(
      app.targets([1])[0],
      ['http://a/announce', 'http://b/announce'],
      [{ id: 1, announce: 'http://new/announce', tier: 1 }],
    ),
  ).rejects.toThrow('remove rejected');
  const after = calls.slice(before);
  expect(after.filter((call) => call.method === 'torrent-set')).toHaveLength(2);
  expect(
    after.filter((call) => call.method === 'torrent-get').at(-1).arguments.ids,
  ).toBeUndefined();
  expect(app.byId.get(1)?.trackers?.[1].announce).toBe('http://new/announce');
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
