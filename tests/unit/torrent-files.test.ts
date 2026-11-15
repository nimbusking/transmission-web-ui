import { expect, it } from 'vitest';
import { fileRows, filePattern, filterFiles, sortFiles } from '../../src/domain/torrent-files';
const torrent = {
  id: 1,
  files: [
    'movie.mkv',
    'readme.URL',
    '____padding_file/0',
    'RARBG_DO_NOT_MIRROR.exe',
    'folder/link.lnk',
    'notes.txt',
  ].map((name, index) => ({ name, length: 10, bytesCompleted: index })),
  fileStats: Array.from({ length: 6 }, (_, index) => ({
    wanted: true,
    priority: 0,
    bytesCompleted: index * 2,
  })),
};
it('retains original RPC indices and uses current fileStats byte counts', () => {
  const rows = fileRows(torrent);
  expect(rows[2].bytesCompleted).toBe(4);
  const filtered = filterFiles(rows, 'URL', null, 'all');
  expect(filtered.map((row) => row.index)).toEqual([1]);
  expect(sortFiles(rows, 'bytesCompleted', true).map((row) => row.index)).toEqual([
    5, 4, 3, 2, 1, 0,
  ]);
  expect(torrent.files[0].bytesCompleted).toBe(0);
});
it('legacy templates only match the intended padding and unnecessary names', () => {
  const rows = fileRows(torrent);
  expect(filterFiles(rows, '', null, 'padding').map((row) => row.index)).toEqual([2]);
  expect(filterFiles(rows, '', null, 'unnecessary').map((row) => row.index)).toEqual([1, 2, 3, 4]);
  expect(filterFiles(rows, 'folder', null, 'unnecessary').map((row) => row.index)).toEqual([4]);
  expect(filterFiles(rows, '', null, 'all')).toHaveLength(6);
});
it('invalid regex safely yields no rows and corrected expressions recover', () => {
  expect(filePattern('[', true)).toBe('invalid');
  expect(filterFiles(fileRows(torrent), '[', filePattern('[', true), 'all')).toEqual([]);
  expect(
    filterFiles(fileRows(torrent), '\\.(mkv|txt)$', filePattern('\\.(mkv|txt)$', true), 'all').map(
      (row) => row.index,
    ),
  ).toEqual([0, 5]);
});
it('sorting is global, deterministic on ties, and never replaces original indices', () => {
  const rows = fileRows({
    id: 2,
    files: [
      { name: 'z', length: 0, bytesCompleted: 0 },
      { name: 'a', length: 10, bytesCompleted: 5 },
      { name: 'a', length: 10, bytesCompleted: 10 },
    ],
    wanted: [false, true, true],
    priorities: [-1, 0, 1],
  });
  expect(sortFiles(rows, 'name', false).map((row) => row.index)).toEqual([1, 2, 0]);
  expect(sortFiles(rows, 'length', true).map((row) => row.index)).toEqual([1, 2, 0]);
  expect(sortFiles(rows, 'wanted', true).map((row) => row.index)).toEqual([1, 2, 0]);
  expect(rows[2].stat.priority).toBe(1);
  expect(
    sortFiles(rows, 'progress', true)
      .slice(0, 2)
      .map((row) => row.index),
  ).toEqual([0, 2]);
});
