import type { Torrent } from './types';
import { safeCount } from './status';
export function torrentSizeTotal(torrents: Torrent[]): number | undefined {
  let total = 0;
  for (const torrent of torrents) {
    const bytes = safeCount(torrent.totalSize);
    if (bytes === undefined || safeCount(total + bytes) === undefined) return undefined;
    total += bytes;
  }
  return total;
}
export interface NavNode {
  key: string;
  name: string;
  kind: string;
  count?: number;
  size?: number;
  children?: NavNode[];
  value?: string;
}
export const NO_TRACKER = '@none',
  UNKNOWN_TRACKER = '@unknown',
  UNKNOWN_FOLDER = '@unknown';
export function trackerServer(url: string): string {
  try {
    const u = new URL(url);
    if (!['http:', 'https:', 'udp:'].includes(u.protocol) || !u.hostname) return UNKNOWN_TRACKER;
    const port = u.port || (u.protocol === 'https:' ? '443' : u.protocol === 'http:' ? '80' : '');
    return `${u.hostname.toLowerCase()}${port ? ':' + port : ''}`;
  } catch {
    return UNKNOWN_TRACKER;
  }
}
export function torrentServers(t: Torrent): string[] {
  if (!t.trackers) return [UNKNOWN_TRACKER];
  return t.trackers.length
    ? [...new Set(t.trackers.map((x) => trackerServer(x.announce)))]
    : [NO_TRACKER];
}
export function pathParts(raw: string): string[] {
  if (!raw) return [];
  const windows = /^[a-z]:[\\/]/i.test(raw) || raw.startsWith('\\\\');
  const path = windows ? raw.replace(/\\/g, '/') : raw;
  const parts = path.split('/').filter(Boolean);
  if (path.startsWith('//')) return ['//' + parts.shift() + '/' + (parts.shift() || ''), ...parts];
  if (path.startsWith('/')) return ['/', ...parts];
  return parts;
}
export function normalizedPath(raw: string): string {
  return pathParts(raw).reduce((a, b) => (a === '/' ? a + b : a ? a + '/' + b : b), '');
}
export function inFolder(raw: string | undefined, folder: string): boolean {
  if (folder === UNKNOWN_FOLDER) return !raw;
  if (!raw) return false;
  const path = normalizedPath(raw);
  return path === folder || path.startsWith(folder === '/' ? '/' : folder + '/');
}
export function hasWarning(t: Torrent): boolean {
  return (
    t.error === 1 ||
    !!t.trackerStats?.some(
      (x) => (x.lastAnnounceTime ?? 0) > 0 && x.lastAnnounceSucceeded === false,
    )
  );
}
function add(node: NavNode, t: Torrent) {
  node.count = (node.count ?? 0) + 1;
  const bytes = safeCount(t.totalSize);
  node.size =
    node.size === undefined || bytes === undefined ? undefined : safeCount(node.size + bytes);
}
export function navigationGroups(torrents: Torrent[]) {
  const servers = new Map<string, NavNode>(),
    paths = new Map<string, NavNode>();
  const folders: NavNode[] = [];
  for (const t of torrents) {
    for (const value of torrentServers(t)) {
      if (!servers.has(value))
        servers.set(value, {
          key: 'tracker:' + value,
          name: value,
          kind: 'server',
          value,
          count: 0,
          size: 0,
        });
      add(servers.get(value)!, t);
    }
    const parts = pathParts(t.downloadDir || '');
    if (!parts.length) parts.push(UNKNOWN_FOLDER);
    let value = '',
      children = folders;
    for (const name of parts) {
      value = value === '/' ? value + name : value ? value + '/' + name : name;
      let node = paths.get(value);
      if (!node) {
        node = {
          key: 'folder:' + value,
          name,
          kind: 'folder',
          value,
          count: 0,
          size: 0,
          children: [],
        };
        paths.set(value, node);
        children.push(node);
      }
      add(node, t);
      children = node.children!;
    }
  }
  const sort = (list: NavNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    list.forEach((n) => {
      if (n.children) sort(n.children);
    });
  };
  sort(folders);
  return { servers: [...servers.values()].sort((a, b) => a.name.localeCompare(b.name)), folders };
}
export interface SessionCounters {
  uploadedBytes?: number;
  downloadedBytes?: number;
  filesAdded?: number;
  sessionCount?: number;
  secondsActive?: number;
}
export interface SessionStatistics {
  uploadSpeed?: number;
  downloadSpeed?: number;
  'cumulative-stats'?: SessionCounters;
  'current-stats'?: SessionCounters;
}
export function durationText(value: number): string {
  const n = Math.floor(value);
  return `${Math.floor(n / 86400)}d ${Math.floor(n / 3600) % 24}h ${Math.floor(n / 60) % 60}m ${n % 60}s`;
}
