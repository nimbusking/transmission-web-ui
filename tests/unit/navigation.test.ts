import { describe, expect, it } from 'vitest';
import {
  navigationGroups,
  torrentServers,
  inFolder,
  hasWarning,
  normalizedPath,
} from '../../src/domain/navigation';
import type { Torrent } from '../../src/domain/types';
const torrent = (id: number, path: string, urls: string[]): Torrent => ({
  id,
  downloadDir: path,
  totalSize: 10,
  trackers: urls.map((announce, id) => ({ announce, id, tier: 0 })),
});
describe('navigation grouping', () => {
  it('deduplicates servers without exposing URL secrets and distinguishes ports', () => {
    const a = torrent(1, '/data/a', [
      'http://Tracker.example/announce?passkey=secret',
      'http://tracker.example:80/other',
      'http://tracker.example:8080/x',
    ]);
    expect(torrentServers(a)).toEqual(['tracker.example:80', 'tracker.example:8080']);
    const result = navigationGroups([a, torrent(2, '/data/abc', ['http://tracker.example/x'])]);
    expect(result.servers.map((n) => [n.name, n.count, n.size])).toEqual([
      ['tracker.example:80', 2, 20],
      ['tracker.example:8080', 1, 10],
    ]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('keeps path roots and segment boundaries distinct', () => {
    expect(inFolder('/data/a/movie', '/data/a')).toBe(true);
    expect(inFolder('/data/abc', '/data/a')).toBe(false);
    expect(normalizedPath('/data/a/')).toBe('/data/a');
    expect(normalizedPath('C:\\data\\电影')).toBe('C:/data/电影');
    expect(normalizedPath('/data/a\\b')).toBe('/data/a\\b');
    expect(normalizedPath('\\\\nas\\share\\a')).toBe('//nas/share/a');
    const result = navigationGroups([
      torrent(1, '/data/a', []),
      torrent(2, '/data/a/movie', []),
      torrent(3, '/data/abc', []),
    ]);
    expect(result.folders[0].count).toBe(3);
    expect(result.folders[0].children![0].children!.find((x) => x.name === 'a')?.count).toBe(2);
  });
  it('separates missing and empty tracker data and unknown sizes', () => {
    expect(torrentServers({ id: 1 })).toEqual(['@unknown']);
    expect(torrentServers(torrent(1, '/', []))).toEqual(['@none']);
    const result = navigationGroups([{ id: 1, downloadDir: '/' }, torrent(2, '/', [])]);
    expect(result.folders[0].size).toBeUndefined();
  });
  it('does not call unannounced trackers warnings and clears recovered warnings', () => {
    expect(
      hasWarning({
        id: 1,
        trackerStats: [{ id: 0, announce: '', tier: 0, lastAnnounceSucceeded: false }],
      }),
    ).toBe(false);
    expect(
      hasWarning({
        id: 1,
        trackerStats: [
          { id: 0, announce: '', tier: 0, lastAnnounceTime: 1, lastAnnounceSucceeded: false },
        ],
      }),
    ).toBe(true);
    expect(hasWarning({ id: 1, error: 1 })).toBe(true);
    expect(
      hasWarning({
        id: 1,
        trackerStats: [
          { id: 0, announce: '', tier: 0, lastAnnounceTime: 2, lastAnnounceSucceeded: true },
        ],
      }),
    ).toBe(false);
  });
});
