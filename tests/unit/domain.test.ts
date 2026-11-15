import { expect, it } from 'vitest';
import {
  applyDelta,
  defaultSettings,
  normalizeTorrent,
  selectTorrents,
} from '../../src/domain/torrents';
import type { Torrent } from '../../src/domain/types';
it('B01/B02: accepts empty snapshots and fills new task identities without dropping errors', () => {
  const rows = new Map<number, Torrent>();
  expect(applyDelta(rows, [], [], true)).toEqual([]);
  expect(applyDelta(rows, [{ id: 1, error: 2, errorString: 'disk full' }])).toEqual([1]);
  applyDelta(rows, [{ id: 1, hashString: 'a', downloadDir: '/data' }]);
  expect(rows.get(1)?.errorString).toBe('disk full');
  const reference = rows.get(1);
  applyDelta(rows, [{ id: 1, hashString: 'a' }]);
  expect(rows.get(1)).toBe(reference);
  applyDelta(rows, [], [1]);
  expect(rows.size).toBe(0);
});
it('B06/B07: renders current sorting and replaces same-length peer content', () => {
  const rows = new Map<number, Torrent>();
  applyDelta(rows, [
    { id: 1, name: 'b', peers: [{ address: 'old' } as any] },
    { id: 2, name: 'a' },
  ]);
  const reference = rows.get(1);
  applyDelta(rows, [{ id: 1, peers: [{ address: 'new' } as any] }]);
  expect(rows.get(1)).not.toBe(reference);
  expect(
    selectTorrents(
      [...rows.values()],
      { status: 'all', search: '', sortKey: 'name', descending: false },
      defaultSettings(),
    ).map((x) => x.id),
  ).toEqual([2, 1]);
});
it('C05: normalizes daemon wanted booleans and numbers', () => {
  expect(normalizeTorrent({ id: 1, wanted: [1, 0, true, false] as any }).wanted).toEqual([
    true,
    false,
    true,
    false,
  ]);
});
it('legacy completed size uses total minus remaining, independently of cumulative downloaded bytes', () => {
  const rows = new Map<number, Torrent>();
  applyDelta(rows, [{ id: 1, totalSize: 1000, leftUntilDone: 300, downloadedEver: 1800 }]);
  expect(rows.get(1)?.completeSize).toBe(700);
  applyDelta(rows, [{ id: 1, leftUntilDone: 100 }]);
  expect(rows.get(1)?.completeSize).toBe(900);
  expect(
    normalizeTorrent({
      id: 1,
      trackerStats: [
        { seederCount: -1, leecherCount: 2 },
        { seederCount: 5, leecherCount: 3 },
      ] as any,
    }).seederCount,
  ).toBeUndefined();
});
it('sorts local label names and Tracker hosts instead of empty/raw object values', () => {
  const settings = defaultSettings();
  settings.labels = [
    { id: 'z', name: 'Zulu', color: '#123456' },
    { id: 'a', name: 'Alpha', color: '#123456' },
  ];
  settings.torrentLabels = { first: ['z'], second: ['a'] };
  const rows = [
    {
      id: 1,
      hashString: 'first',
      trackers: [{ id: 0, tier: 0, announce: 'http://z.example/announce' }],
    },
    {
      id: 2,
      hashString: 'second',
      trackers: [{ id: 0, tier: 0, announce: 'http://a.example/announce' }],
    },
  ];
  for (const sortKey of ['labels', 'trackers'])
    expect(
      selectTorrents(rows, { status: 'all', search: '', sortKey, descending: false }, settings).map(
        (row) => row.id,
      ),
    ).toEqual([2, 1]);
});
