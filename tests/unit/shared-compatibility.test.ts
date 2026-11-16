import { expect, it } from 'vitest';
import { heldBytes, progressText, safeCount } from '../../src/domain/status';
import {
  applyDelta,
  normalizeTorrent,
  DYNAMIC_FIELDS,
  BASE_FIELDS,
} from '../../src/domain/torrents';
import { fileRows } from '../../src/domain/torrent-files';
import { limitPatch } from '../../src/domain/limits';
import { trackerCapabilities, trackerPatch, sameTrackers } from '../../src/domain/tracker-edit';
import type { Torrent } from '../../src/domain/types';
it('held data includes unchecked/skipped data with strict byte validation and metadata bound', () => {
  expect(
    heldBytes({ haveValid: 16384, haveUnchecked: 0, totalSize: 32768, metadataPercentComplete: 1 }),
  ).toBe(16384);
  expect(heldBytes({ haveValid: 16, haveUnchecked: 16 })).toBe(32);
  expect(heldBytes({ haveValid: 0, haveUnchecked: 0 })).toBe(0);
  for (const bad of [undefined, -1, NaN, Infinity, '0', 1.2, Number.MAX_SAFE_INTEGER])
    expect(heldBytes({ haveValid: bad, haveUnchecked: 1 })).toBeUndefined();
  expect(
    heldBytes({ haveValid: 16, haveUnchecked: 0, totalSize: 0, metadataPercentComplete: 0 }),
  ).toBe(16);
  expect(
    heldBytes({ haveValid: 16, haveUnchecked: 0, totalSize: 0, metadataPercentComplete: 1 }),
  ).toBeUndefined();
});
it('requested missing fields become unknown, base reads and absent delta rows preserve dynamic data', () => {
  const rows = new Map<number, Torrent>();
  applyDelta(rows, [
    {
      id: 1,
      hashString: 'a',
      haveValid: 10,
      haveUnchecked: 2,
      metadataPercentComplete: 0,
      totalSize: 0,
    },
  ]);
  applyDelta(rows, [{ id: 1, hashString: 'a', downloadDir: '/a' }], [], false, BASE_FIELDS);
  expect(rows.get(1)?.completeSize).toBe(12);
  applyDelta(rows, [], [], false, DYNAMIC_FIELDS);
  expect(rows.get(1)?.completeSize).toBe(12);
  applyDelta(
    rows,
    [{ id: 1, hashString: 'a', haveValid: 10, haveUnchecked: 2, metadataPercentComplete: 1 }],
    [],
    false,
    DYNAMIC_FIELDS,
  );
  expect(rows.get(1)?.totalSize).toBeUndefined();
  expect(rows.get(1)?.completeSize).toBe(12);
  applyDelta(rows, [{ id: 1, hashString: 'a' }], [], false, DYNAMIC_FIELDS);
  expect(rows.get(1)?.completeSize).toBeUndefined();
});
it('reports remain sums with strict unknowns, independent activity and special file values', () => {
  const report = (counts: any[]) =>
    normalizeTorrent({
      id: 1,
      trackerStats: counts.map((seederCount, id) => ({ id, announce: '', tier: 0, seederCount })),
    }).seederCount;
  expect(report([10, 10])).toBe(20);
  expect(report([0, 0])).toBe(0);
  for (const values of [[], [10, undefined], [10, -1], [10, 1.5]])
    expect(report(values)).toBeUndefined();
  expect(safeCount(1.5)).toBeUndefined();
  expect(progressText(undefined)).toBe('—');
  expect(progressText(0)).toBe('0.0%');
  const row = normalizeTorrent({
    id: 1,
    files: [{ name: 'a', length: 0, bytesCompleted: 0 }],
    fileStats: [{ bytesCompleted: 0 } as any],
    wanted: [0] as any,
    priorities: [-1],
  });
  expect(fileRows(row)[0].stat).toMatchObject({ wanted: false, priority: -1 });
  expect(
    fileRows({ ...row, wanted: undefined, priorities: undefined })[0].stat.wanted,
  ).toBeUndefined();
});
it('limit intent touches only requested direction and checks desired state before baseline conflict', () => {
  const baseline = {
    id: 1,
    downloadLimited: true,
    downloadLimit: 123,
    uploadLimited: false,
    uploadLimit: 999999999,
  };
  expect(
    limitPatch(baseline, baseline, {
      download: { mode: 'keep', value: null },
      upload: { mode: 'keep', value: null },
    }),
  ).toEqual({});
  const disable = {
    download: { mode: 'disable' as const, value: null },
    upload: { mode: 'keep' as const, value: null },
  };
  expect(
    limitPatch(baseline, { ...baseline, downloadLimit: 999, uploadLimited: true }, disable),
  ).toEqual({ downloadLimited: false });
  expect(limitPatch(baseline, { ...baseline, downloadLimited: false }, disable)).toEqual({});
  expect(
    limitPatch(baseline, baseline, { ...disable, download: { mode: 'limit', value: 0 } }),
  ).toEqual({ downloadLimit: 0 });
  expect(() =>
    limitPatch(
      baseline,
      { ...baseline, downloadLimit: 100 },
      { ...disable, download: { mode: 'limit', value: 200 } },
    ),
  ).toThrow('changed');
});
it('Tracker baseline compares identity/order/groups, ignores scrape and preserves full RPC17 capability', () => {
  const baseline = [
    { id: 1, tier: 3, announce: 'http://a/announce?passkey=x' },
    { id: 2, tier: 7, announce: 'http://b/announce' },
  ];
  expect(
    sameTrackers(
      baseline,
      baseline.map((x) => ({ ...x, seederCount: 99 })),
      true,
    ),
  ).toBe(true);
  expect(
    sameTrackers(
      baseline,
      baseline.map((x) => ({ ...x, tier: 0 })),
      true,
    ),
  ).toBe(false);
  expect(
    sameTrackers(
      baseline,
      baseline.map((x) => ({ ...x, id: x.id + 1 })),
      true,
    ),
  ).toBe(false);
  for (const version of ['4.0.0', '4.0.6', '4.1.4'])
    expect(
      trackerPatch(
        baseline,
        baseline.map((x) => ({ ...x, tier: 0 })),
        trackerCapabilities({ version, 'rpc-version': 17 }, 4),
      ),
    ).toEqual({ trackerList: baseline.map((x) => x.announce).join('\n') });
  expect(trackerCapabilities(undefined, 5)).toEqual({ generation: 5, state: 'unknown' });
});

it('3.00 standalone membership plans remain one RPC and mixed plans cannot execute a prefix', () => {
  const caps = trackerCapabilities({ version: '3.00', 'rpc-version': 16 }, 1);
  const before = [
    { id: 0, tier: 0, announce: 'http://a/announce' },
    { id: 1, tier: 1, announce: 'http://b/announce' },
  ];
  expect(trackerPatch(before, before.slice(0, 1), caps)).toEqual({ trackerRemove: [1] });
  expect(
    trackerPatch(before, [...before, { tier: 2, announce: 'http://c/announce' }], caps),
  ).toEqual({ trackerAdd: ['http://c/announce'] });
  expect(() =>
    trackerPatch(before, [{ ...before[0], announce: 'http://new/announce' }], caps),
  ).toThrow('restricted');
  expect(() =>
    trackerPatch(before, [{ ...before[0] }, { tier: 2, announce: 'http://c/announce' }], caps),
  ).toThrow('restricted');
});
it('only the verified 3.00 numeric overflow boundary is rejected; other versions retain their range', () => {
  const row = { id: 1, downloadLimited: false, downloadLimit: 123 };
  const intent = {
    download: { mode: 'limit' as const, value: 4294968 },
    upload: { mode: 'keep' as const, value: null },
  };
  expect(() =>
    limitPatch(row, row, intent, { version: '3.00 (build)', 'rpc-version': 16 }),
  ).toThrow('4294967');
  for (const version of ['4.0.0', '4.0.6', '4.1.4'])
    expect(limitPatch(row, row, intent, { version, 'rpc-version': 17 })).toEqual({
      downloadLimited: true,
      downloadLimit: 4294968,
    });
});

it('editing another Tracker preserves historical duplicate URLs but rejects newly introduced collisions', () => {
  const before = [
    { id: 0, tier: 0, announce: 'http://a/announce' },
    { id: 1, tier: 1, announce: 'http://a/announce' },
    { id: 2, tier: 2, announce: 'http://b/announce' },
  ];
  const caps = trackerCapabilities({ version: '4.1.4', 'rpc-version': 19 }, 1);
  expect(
    trackerPatch(
      before,
      before.map((x) => (x.id === 2 ? { ...x, announce: 'http://c/announce' } : x)),
      caps,
    ),
  ).toHaveProperty('trackerList');
  expect(() =>
    trackerPatch(
      before,
      before.map((x) => ({ ...x, announce: 'http://a/announce' })),
      caps,
    ),
  ).toThrow('Duplicate');
});
