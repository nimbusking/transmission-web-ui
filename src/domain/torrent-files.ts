import type { Torrent, TorrentFile, FileStat } from './types';
import { fileProgress } from './torrents';
export type FilePreset = 'all' | 'padding' | 'unnecessary';
export type FileSortKey = 'name' | 'length' | 'progress' | 'bytesCompleted' | 'wanted';
export type FileRow = TorrentFile & { index: number; stat: Partial<FileStat> };
export function fileRows(torrent: Torrent | undefined): FileRow[] {
  return (torrent?.files ?? []).map((file, index) => {
    const stat = torrent?.fileStats?.[index];
    return {
      ...file,
      index,
      bytesCompleted: stat?.bytesCompleted ?? file.bytesCompleted,
      stat: {
        ...stat,
        wanted: stat?.wanted ?? torrent?.wanted?.[index],
        priority: stat?.priority ?? torrent?.priorities?.[index],
      },
    };
  });
}
export function filePattern(query: string, regex: boolean): RegExp | 'invalid' | null {
  try {
    return regex ? new RegExp(query, 'i') : null;
  } catch {
    return 'invalid';
  }
}
export function filterFiles(
  rows: FileRow[],
  query: string,
  pattern: ReturnType<typeof filePattern>,
  preset: FilePreset,
) {
  if (pattern === 'invalid') return [];
  return rows.filter((row) => {
    const name = row.name;
    const presetMatch =
      preset === 'padding'
        ? /____padding_file/i.test(name)
        : preset === 'unnecessary'
          ? /(?:\.(?:url|lnk)$|(?:^|\/)RARBG_DO_NOT_MIRROR\.exe$|____padding_file)/i.test(name)
          : true;
    return (
      presetMatch &&
      (pattern ? pattern.test(name) : name.toLowerCase().includes(query.toLowerCase()))
    );
  });
}
export function sortFiles(
  rows: FileRow[],
  key: FileSortKey | undefined,
  descending: boolean,
): FileRow[] {
  if (!key) return rows;
  const value = (row: FileRow) =>
    key === 'progress'
      ? fileProgress(row.bytesCompleted, row.length)
      : key === 'wanted'
        ? typeof row.stat.wanted === 'boolean'
          ? Number(row.stat.wanted)
          : undefined
        : row[key];
  return [...rows].sort((a, b) => {
    const x = value(a),
      y = value(b);
    const valid = (v: unknown) =>
      typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
    if (!valid(x) || !valid(y)) return valid(x) ? -1 : valid(y) ? 1 : a.index - b.index;
    const order =
      typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y);
    return (descending ? -order : order) || a.index - b.index;
  });
}
