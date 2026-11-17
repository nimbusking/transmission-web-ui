import { heldBytes, safeCount, wantedValue, priorityValue, progressFraction } from './status';
import { hasError, hasWarning, inFolder, torrentServers, trackerServer } from './navigation';
import { createNameMatcher } from './name-search';
import type { Torrent, ColumnSetting, Settings } from './types';

export const BASE_FIELDS = [
  'id',
  'hashString',
  'name',
  'downloadDir',
  'totalSize',
  'isPrivate',
  'trackers',
  'addedDate',
  'metadataPercentComplete',
];
export const DYNAMIC_FIELDS = [
  'id',
  'hashString',
  'haveValid',
  'haveUnchecked',
  'name',
  'status',
  'percentDone',
  'sizeWhenDone',
  'rateDownload',
  'rateUpload',
  'uploadRatio',
  'uploadedEver',
  'downloadedEver',
  'error',
  'errorString',
  'queuePosition',
  'eta',
  'activityDate',
  'doneDate',
  'metadataPercentComplete',
  'recheckProgress',
  'leftUntilDone',
  'trackerStats',
  'peersSendingToUs',
  'peersGettingFromUs',
];
export const SUMMARY_FIELDS = [...new Set([...BASE_FIELDS, ...DYNAMIC_FIELDS])];
export const CONFIG_FIELDS = [
  'id',
  'downloadLimit',
  'downloadLimited',
  'uploadLimit',
  'uploadLimited',
  'honorsSessionLimits',
  'peer-limit',
  'bandwidthPriority',
  'seedRatioLimit',
  'seedRatioMode',
  'seedIdleLimit',
  'seedIdleMode',
];
export const STATUS_NAMES: Record<number, string> = {
  0: 'paused',
  1: 'checkWait',
  2: 'checking',
  3: 'downloadWait',
  4: 'downloading',
  5: 'seedWait',
  6: 'seeding',
};
export const PREVIOUS_DEFAULT_COLUMNS: ColumnSetting[] = [
  ['name', 300, true],
  ['totalSize', 100, true],
  ['percentDone', 120, true],
  ['status', 110, true],
  ['rateDownload', 110, true],
  ['rateUpload', 110, true],
  ['eta', 90, true],
  ['uploadRatio', 80, true],
  ['uploadedEver', 110, false],
  ['downloadedEver', 110, false],
  ['queuePosition', 80, false],
  ['labels', 150, true],
  ['downloadDir', 220, false],
  ['trackers', 200, false],
  ['addedDate', 170, false],
  ['doneDate', 170, false],
  ['completeSize', 110, false],
  ['seederCount', 100, false],
  ['leecherCount', 100, false],
  ['activityDate', 170, false],
  ['id', 80, false],
  ['isPrivate', 80, false],
  ['errorString', 220, false],
].map(([key, width, visible]) => ({
  key: String(key),
  width: Number(width),
  visible: Boolean(visible),
}));
export const DEFAULT_COLUMNS: ColumnSetting[] = [
  ['name', 300, true],
  ['totalSize', 100, true],
  ['percentDone', 120, true],
  ['eta', 100, true],
  ['uploadRatio', 80, true],
  ['status', 110, true],
  ['seederCount', 110, true],
  ['leecherCount', 110, true],
  ['rateDownload', 110, true],
  ['rateUpload', 110, true],
  ['completeSize', 110, true],
  ['uploadedEver', 110, true],
  ['addedDate', 170, true],
  ['id', 60, true],
  ['queuePosition', 70, true],
  ['trackers', 200, true],
  ['downloadDir', 220, true],
  ['activityDate', 170, true],
  ['labels', 170, true],
  ['doneDate', 170, true],
  ['downloadedEver', 110, false],
  ['isPrivate', 80, false],
  ['errorString', 220, false],
].map(([key, width, visible]) => ({
  key: String(key),
  width: Number(width),
  visible: Boolean(visible),
}));
export function defaultSettings(): Settings {
  return {
    schemaVersion: 2,
    ui: {
      locale: 'auto',
      theme: 'system',
      layoutTheme: 'workbench',
      visualTheme: 'modern',
      refreshIntervalMs: 5000,
      autoRefresh: true,
      pagination: true,
      pageSize: 200,
      filePageSize: 200,
      sidebarWidth: 220,
      detailHeight: 310,
      forceDesktop: false,
      columns: structuredClone(DEFAULT_COLUMNS),
      columnPresetVersion: 1,
      ipUrl: 'https://ipinfo.io/{ip}/json',
      trackerListUrl:
        'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt',
    },
    labels: [],
    torrentLabels: {},
    folderDictionary: [],
  };
}
export function normalizeTorrent(raw: Torrent): Torrent {
  const item = { ...raw };
  for (const key of ['peersSendingToUs', 'peersGettingFromUs'])
    if (Object.hasOwn(raw, key)) item[key] = safeCount(raw[key]);
  if (Object.hasOwn(raw, 'percentDone')) item.percentDone = progressFraction(raw.percentDone);
  if (raw.wanted) item.wanted = raw.wanted.map(wantedValue);
  if (raw.fileStats)
    item.fileStats = raw.fileStats.map((x) => ({
      ...x,
      wanted: wantedValue(x.wanted),
      priority: priorityValue(x.priority),
    }));
  if (raw.trackerStats) {
    for (const field of ['seederCount', 'leecherCount']) {
      const values = raw.trackerStats.map((x) => x[field]);
      item[field] =
        values.length && values.every((x) => safeCount(x) !== undefined)
          ? safeCount(values.reduce((sum: number, x: number) => sum + x, 0))
          : undefined;
    }
  }
  item.completeSize = heldBytes(item);
  return item;
}
const knownIdentity = new WeakMap<Torrent, string>();
export function applyDelta(
  byId: Map<number, Torrent>,
  items: Torrent[],
  removed: number[] = [],
  snapshot = false,
  requestedFields: readonly string[] = [],
): number[] {
  if (snapshot) {
    const keep = new Set(items.map((x) => x.id));
    for (const id of byId.keys()) if (!keep.has(id)) byId.delete(id);
  }
  for (const id of removed) byId.delete(id);
  const missing: number[] = [];
  for (const raw of items) {
    if (!Number.isInteger(raw.id)) continue;
    const input = { ...raw };
    if (requestedFields.includes('hashString') && !input.hashString) input.hashString = undefined;
    for (const field of [
      'haveValid',
      'haveUnchecked',
      'trackerStats',
      'peersSendingToUs',
      'peersGettingFromUs',
      'percentDone',
    ])
      if (requestedFields.includes(field) && !Object.hasOwn(input, field)) input[field] = undefined;
    const item = normalizeTorrent(input),
      previous = byId.get(item.id);
    const replaced =
      !!(previous?.hashString || (previous && knownIdentity.get(previous))) &&
      !!item.hashString &&
      (previous?.hashString || (previous && knownIdentity.get(previous))) !== item.hashString;
    const metadataReady =
      previous && previous.metadataPercentComplete !== 1 && item.metadataPercentComplete === 1;
    const next = { ...(replaced ? undefined : previous), ...item };
    if (metadataReady && !requestedFields.includes('totalSize')) next.totalSize = undefined;
    next.completeSize = heldBytes(next);
    if (Object.hasOwn(input, 'trackerStats') && !input.trackerStats) {
      next.seederCount = undefined;
      next.leecherCount = undefined;
    }
    const identity =
      next.hashString || (previous && knownIdentity.get(previous)) || previous?.hashString;
    if (identity) knownIdentity.set(next, identity);
    // Preserve the reference unless fields actually changed. RPC arrays are compared by value.
    const changed =
      !previous ||
      replaced ||
      metadataReady ||
      next.completeSize !== previous.completeSize ||
      next.seederCount !== previous.seederCount ||
      next.leecherCount !== previous.leecherCount ||
      Object.keys(item).some((key) =>
        typeof item[key] === 'object'
          ? JSON.stringify(item[key]) !== JSON.stringify(previous[key])
          : item[key] !== previous[key],
      );
    if (changed) byId.set(item.id, next);
    if (
      !next.hashString ||
      next.downloadDir === undefined ||
      (next.metadataPercentComplete === 1 && next.totalSize === undefined)
    )
      missing.push(item.id);
  }
  return missing;
}
export function statusMatches(t: Torrent, filter: string): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return (t.rateDownload || 0) > 0 || (t.rateUpload || 0) > 0;
    case 'downloading':
      return t.status === 3 || t.status === 4;
    case 'seeding':
      return t.status === 5 || t.status === 6;
    case 'paused':
      return t.status === 0;
    case 'checking':
      return t.status === 1 || t.status === 2;
    case 'error':
      return hasError(t);
    case 'warning':
      return hasWarning(t);
    case 'private':
      return Boolean(t.isPrivate);
    default:
      return true;
  }
}
export function selectTorrents(
  items: Torrent[],
  options: {
    status: string;
    search: string;
    sortKey: string;
    descending: boolean;
    folder?: string;
    tracker?: string;
    label?: string;
  },
  settings: Settings,
): Torrent[] {
  const matchesName = createNameMatcher(options.search);
  const result = items.filter(
    (t) =>
      statusMatches(t, options.status) &&
      matchesName(t.name) &&
      (!options.folder || inFolder(t.downloadDir, options.folder)) &&
      (!options.tracker || torrentServers(t).includes(options.tracker)) &&
      (!options.label || settings.torrentLabels[t.hashString || '']?.includes(options.label)),
  );
  const key = options.sortKey,
    direction = options.descending ? -1 : 1;
  const labelNames =
    key === 'labels' ? new Map(settings.labels.map((label) => [label.id, label.name])) : undefined;
  const derived =
    key === 'labels' || key === 'trackers'
      ? new Map(
          result.map((torrent) => [
            torrent.id,
            key === 'labels'
              ? (settings.torrentLabels[torrent.hashString || ''] ?? [])
                  .map((id) => labelNames?.get(id) ?? '')
                  .sort()
                  .join(', ')
              : [
                  ...new Set(
                    (torrent.trackers ?? []).map((tracker) => trackerServer(tracker.announce)),
                  ),
                ]
                  .sort()
                  .join(', '),
          ]),
        )
      : undefined;
  const sortValue = (row: Torrent) => {
    const value = derived?.get(row.id) ?? row[key];
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return undefined;
      if (key === 'uploadRatio' && value === -2) return Infinity;
      if ((key === 'eta' || key === 'uploadRatio') && value < 0) return undefined;
      if (key.endsWith('Date') && value <= 0) return undefined;
    }
    return value;
  };
  return result.sort((a, b) => {
    const av = sortValue(a),
      bv = sortValue(b);
    const missingA = av == null;
    const missingB = bv == null;
    if (missingA !== missingB) return missingA ? 1 : -1;
    const value =
      typeof av === 'number' && typeof bv === 'number'
        ? av === bv
          ? 0
          : av > bv
            ? 1
            : -1
        : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
    return value * direction || a.id - b.id;
  });
}
export function trackerHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
export function formatBytes(value: number, rate = false): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let n = value,
    index = 0;
  while (n >= 1024 && index < units.length - 1) {
    n /= 1024;
    index++;
  }
  return `${n.toFixed(index ? 1 : 0)} ${units[index]}${rate ? '/s' : ''}`;
}
export function formatRatio(value: number): string {
  return value === -2 ? '∞' : value < 0 || !Number.isFinite(value) ? '—' : value.toFixed(6);
}
export function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 60) return `${Math.floor(value)}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m`;
  if (value < 86400) return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
  return `${Math.floor(value / 86400)}d ${Math.floor((value % 86400) / 3600)}h`;
}
export function fileProgress(completed: number, size: number): number {
  return size === 0 ? 1 : Math.max(0, Math.min(1, completed / size));
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function uniqueId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
