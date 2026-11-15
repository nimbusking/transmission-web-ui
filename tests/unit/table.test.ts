import { expect, it } from 'vitest';
import {
  DEFAULT_COLUMNS,
  PREVIOUS_DEFAULT_COLUMNS,
  defaultSettings,
  normalizeTorrent,
  selectTorrents,
} from '../../src/domain/torrents';
import {
  tableBytes,
  tableDate,
  tableServers,
  peerCount,
  progressValue,
} from '../../src/domain/table';
import { migrateSettings } from '../../src/services/settings';
const keys = [
  'name',
  'totalSize',
  'percentDone',
  'eta',
  'uploadRatio',
  'status',
  'seederCount',
  'leecherCount',
  'rateDownload',
  'rateUpload',
  'completeSize',
  'uploadedEver',
  'addedDate',
  'id',
  'queuePosition',
  'trackers',
  'downloadDir',
  'activityDate',
  'labels',
  'doneDate',
];
it('complete preset exposes exactly the legacy twenty columns in order', () => {
  expect(DEFAULT_COLUMNS.filter((x) => x.visible).map((x) => x.key)).toEqual(keys);
  expect(DEFAULT_COLUMNS.filter((x) => !x.visible).map((x) => x.key)).toEqual([
    'downloadedEver',
    'isPrivate',
    'errorString',
  ]);
});
it('upgrades only the exact former factory layout and retains a reversible backup', () => {
  const old = defaultSettings();
  delete old.ui.columnPresetVersion;
  old.ui.columns = structuredClone(PREVIOUS_DEFAULT_COLUMNS);
  old.ui.navigationExpanded = { 'status:all': false };
  old.folderDictionary = ['/keep'];
  const next = migrateSettings(old).settings;
  expect(next.ui.columns).toEqual(DEFAULT_COLUMNS);
  expect(next.ui.columnsBackup).toEqual(PREVIOUS_DEFAULT_COLUMNS);
  expect(next.ui.navigationExpanded).toEqual(old.ui.navigationExpanded);
  expect(next.folderDictionary).toEqual(['/keep']);
  old.ui.columns[0].width = 351;
  const custom = migrateSettings(old).settings;
  expect(custom.ui.columns).toEqual(old.ui.columns);
  expect(custom.ui.columnsBackup).toBeUndefined();
});
it('formats table values without false dates, zero peers or secret URLs', () => {
  expect(tableBytes(1024)).toBe('1.00 KiB');
  expect(tableBytes(0, true)).toBe('0.00 B/s');
  expect(tableBytes(undefined)).toBe('—');
  expect(tableDate(0)).toBe('—');
  expect(tableDate(Infinity)).toBe('—');
  expect(tableDate(1700000000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  expect(
    tableServers({
      id: 1,
      trackers: [
        { id: 1, tier: 0, announce: 'http://modern:8080/announce?passkey=secret' },
        { id: 2, tier: 0, announce: 'http://modern:8080/other' },
      ],
    }),
  ).toBe('modern:8080');
  expect(peerCount(undefined, 0)).toBe('— (0)');
  expect(
    normalizeTorrent({ id: 1, trackerStats: [{ id: 1, tier: 0, announce: '', seederCount: -1 }] })
      .seederCount,
  ).toBeUndefined();
  expect(progressValue({ id: 1, status: 2, percentDone: 0.9, recheckProgress: 0.25 })).toEqual({
    checking: true,
    value: 25,
  });
});
it('sorts raw values and places missing values after valid zero in both directions', () => {
  for (const descending of [false, true]) {
    const sorted = selectTorrents(
      [{ id: 1, totalSize: 10 }, { id: 2, totalSize: 0 }, { id: 3 }],
      { status: 'all', search: '', sortKey: 'totalSize', descending },
      defaultSettings(),
    );
    expect(sorted.at(-1)?.id).toBe(3);
    expect(sorted.slice(0, 2).map((x) => x.id)).toEqual(descending ? [1, 2] : [2, 1]);
  }
});

it('ratio infinity and unknown dates sort by meaning rather than formatted text', () => {
  const rows = [
    { id: 1, uploadRatio: -1 },
    { id: 2, uploadRatio: 0 },
    { id: 3, uploadRatio: -2 },
  ];
  const options = { status: 'all', search: '', sortKey: 'uploadRatio', descending: false };
  expect(selectTorrents(rows, options, defaultSettings()).map((x) => x.id)).toEqual([2, 3, 1]);
  expect(
    selectTorrents(rows, { ...options, descending: true }, defaultSettings()).map((x) => x.id),
  ).toEqual([3, 2, 1]);
});
