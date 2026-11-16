import { expect, it } from 'vitest';
import { createNameMatcher } from '../../src/domain/name-search';
import { defaultSettings, selectTorrents } from '../../src/domain/torrents';
import type { Torrent } from '../../src/domain/types';

it('matches partial names, case and full-width forms without changing the input', () => {
  const name = '三体.S01.１０８０p.WEB-DL';
  for (const query of ['三体', '1080', 'web-dl', 'ＷＥＢ', 's01'])
    expect(createNameMatcher(query)(name), query).toBe(true);
  expect(name).toBe('三体.S01.１０８０p.WEB-DL');
  expect(createNameMatcher('三休')(name)).toBe(false);
});

it('requires all literal keywords in any order and accepts repeated or Unicode whitespace', () => {
  const matches = createNameMatcher('  １０８０\t三体　WEB\n三体  ');
  expect(matches('三体.S01.1080p.WEB-DL')).toBe(true);
  expect(matches('三体.S01.2160p.WEB-DL')).toBe(false);
  expect(matches('三体.S01.1080p.BluRay')).toBe(false);
  expect(createNameMatcher('b a')('Alpha Beta')).toBe(true);
  expect(createNameMatcher('[S01] + . *')('Show.[S01]+.*')).toBe(true);
  expect(createNameMatcher('.*')('Anything')).toBe(false);
});

it('blank queries accept every name while missing names cannot match a nonempty query', () => {
  for (const query of ['', '  \t\n　']) {
    expect(createNameMatcher(query)(undefined)).toBe(true);
    expect(createNameMatcher(query)('Name')).toBe(true);
  }
  expect(createNameMatcher('name')(undefined)).toBe(false);
  expect(createNameMatcher('name')('')).toBe(false);
});

it('only names match text; hash/path remain available for their existing independent filters', () => {
  const rows: Torrent[] = [
    { id: 1, name: 'Alpha', hashString: 'deadbeef', downloadDir: '/data/comparison' },
    { id: 2, name: '对照-C-部分数据', hashString: 'other', downloadDir: '/data/comparison' },
    { id: 3, hashString: 'missing', downloadDir: '/data/comparison' },
  ];
  const settings = defaultSettings();
  const select = (search: string) =>
    selectTorrents(rows, { status: 'all', search, sortKey: 'id', descending: false }, settings).map(
      (row) => row.id,
    );
  expect(select('C')).toEqual([2]);
  expect(select('deadbeef')).toEqual([]);
  expect(select('comparison')).toEqual([]);
  expect(select('')).toEqual([1, 2, 3]);
  rows[0]!.name = 'deadbeef comparison';
  expect(select('comparison deadbeef')).toEqual([1]);
});

it('intersects navigation filters and preserves the chosen numeric order and source entities', () => {
  const settings = defaultSettings();
  settings.labels = [{ id: 'saved', name: 'Saved', color: '#123456' }];
  settings.torrentLabels = { first: ['saved'], second: ['saved'], third: ['saved'] };
  const rows: Torrent[] = [
    {
      id: 1,
      name: '三体.1080p',
      status: 0,
      queuePosition: 2,
      hashString: 'first',
      downloadDir: '/a',
    },
    {
      id: 2,
      name: '三体.1080p',
      status: 0,
      queuePosition: 1,
      hashString: 'second',
      downloadDir: '/a/sub',
    },
    {
      id: 3,
      name: '三体.1080p',
      status: 4,
      queuePosition: 0,
      hashString: 'third',
      downloadDir: '/b',
    },
  ];
  rows.forEach(
    (row) => (row.trackers = [{ id: 0, tier: 0, announce: 'http://tracker.local/announce' }]),
  );
  const before = structuredClone(rows);
  const options = {
    search: '1080 三体',
    status: 'paused',
    folder: '/a',
    tracker: 'tracker.local:80',
    label: 'saved',
    sortKey: 'queuePosition',
    descending: false,
  };
  expect(selectTorrents(rows, options, settings).map((row) => row.id)).toEqual([2, 1]);
  expect(
    selectTorrents(rows, { ...options, descending: true }, settings).map((row) => row.id),
  ).toEqual([1, 2]);
  expect(selectTorrents(rows, { ...options, folder: '/b' }, settings)).toEqual([]);
  expect(rows).toEqual(before);
});
