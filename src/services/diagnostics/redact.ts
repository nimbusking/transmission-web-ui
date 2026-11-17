import { SUMMARY_FIELDS, CONFIG_FIELDS, defaultSettings } from '../../domain/torrents';
import { SESSION_FIELDS } from '../session-fields';

const scalarFields = new Set([
  ...SUMMARY_FIELDS,
  ...CONFIG_FIELDS,
  'dateCreated',
  'pieceCount',
  'pieceSize',
  'download-dir-free-space',
  'size-bytes',
  'size',
  'free',
]);
const sessionFields = new Set(SESSION_FIELDS.map((field) => field.key));
const uiFields = [
  'locale',
  'theme',
  'layoutTheme',
  'visualTheme',
  'refreshIntervalMs',
  'autoRefresh',
  'pagination',
  'pageSize',
  'filePageSize',
  'sidebarWidth',
  'detailHeight',
  'forceDesktop',
] as const;
export const supportedMethods = new Set([
  'session-get',
  'session-stats',
  'torrent-get',
  'torrent-start',
  'torrent-stop',
  'free-space',
]);

/** Maps are ephemeral and never serialized. No original identity is persisted. */
export class Redactor {
  private maps = new Map<string, Map<string, number>>();
  private index(kind: string, value: unknown) {
    let map = this.maps.get(kind);
    if (!map) {
      map = new Map();
      this.maps.set(kind, map);
    }
    const key = String(value);
    if (!map.has(key)) map.set(key, map.size + 1);
    return map.get(key)!;
  }
  id(value: unknown) {
    return this.index('id', value);
  }
  hash(value: unknown) {
    return this.index('hash', value).toString(16).padStart(40, '0');
  }
  text(kind: string, value: unknown) {
    if (value === '') return '';
    return `${kind}-${this.index(kind, value)}`;
  }
  path(value: unknown) {
    return value === '' ? '' : `/redacted/${this.text('path', value)}`;
  }
  torrent(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === 'id') out[key] = this.id(value);
      else if (key === 'hashString') out[key] = this.hash(value);
      else if (key === 'name') out[key] = this.text('task', value);
      else if (key === 'downloadDir') out[key] = this.path(value);
      else if (key === 'errorString') out[key] = value === '' ? '' : 'Recorded task error';
      else if (
        key === 'pieces' &&
        typeof value === 'string' &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(value)
      )
        out[key] = value;
      else if (['comment', 'creator', 'magnetLink'].includes(key)) out[key] = '';
      else if ((key === 'trackers' || key === 'trackerStats') && Array.isArray(value)) {
        out[key] = value.map((entry) => {
          const row: Record<string, unknown> = {};
          for (const [field, item] of Object.entries(entry)) {
            if (typeof item === 'number' || typeof item === 'boolean' || item === null) {
              if (
                [
                  'id',
                  'tier',
                  'seederCount',
                  'leecherCount',
                  'lastAnnounceSucceeded',
                  'lastAnnounceTime',
                  'lastScrapeSucceeded',
                  'lastScrapeTime',
                  'hasAnnounced',
                  'hasScraped',
                  'announceState',
                  'scrapeState',
                  'downloadCount',
                ].includes(field)
              )
                row[field] = item;
            } else if (field === 'announce' || field === 'host' || field === 'scrape') {
              row[field] = `https://${this.text('tracker', item)}.invalid/announce`;
            } else if (field === 'lastAnnounceResult' || field === 'lastScrapeResult') {
              row[field] = item ? 'Recorded tracker result' : '';
            }
          }
          return row;
        });
      } else if (
        scalarFields.has(key) &&
        (value === null || typeof value === 'number' || typeof value === 'boolean')
      )
        out[key] = value;
    }
    return out;
  }
  session(input: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (
        key === 'version' &&
        typeof value === 'string' &&
        /^[\d.]+(?:\s*\([\da-z]+\))?$/i.test(value)
      )
        out[key] = value;
      else if (key === 'session-id') out[key] = this.text('session', value);
      else if (key === 'download-dir' || key === 'incomplete-dir') out[key] = this.path(value);
      else if (
        (sessionFields.has(key) ||
          ['rpc-version', 'rpc-version-minimum', 'download-dir-free-space'].includes(key)) &&
        (typeof value === 'number' || typeof value === 'boolean' || value === null)
      )
        out[key] = value;
    }
    return out;
  }
  numbers(input: Record<string, unknown>, depth = 0): Record<string, unknown> {
    if (depth > 3) return {};
    const keys = new Set([
      'activeTorrentCount',
      'downloadSpeed',
      'pausedTorrentCount',
      'torrentCount',
      'uploadSpeed',
      'cumulative-stats',
      'current-stats',
      'uploadedBytes',
      'downloadedBytes',
      'filesAdded',
      'sessionCount',
      'secondsActive',
      'size-bytes',
      'size',
      'free',
    ]);
    return Object.fromEntries(
      Object.entries(input)
        .filter(([key]) => keys.has(key))
        .map(([key, value]) => [
          key,
          typeof value === 'number' || value === null
            ? value
            : value && typeof value === 'object'
              ? this.numbers(value as Record<string, unknown>, depth + 1)
              : null,
        ]),
    );
  }
  args(method: string, input: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    if (Array.isArray(input.fields))
      out.fields = input.fields.filter(
        (value) =>
          typeof value === 'string' &&
          (scalarFields.has(value) ||
            ['comment', 'creator', 'magnetLink', 'pieces', 'trackers', 'trackerStats'].includes(
              value,
            )),
      );
    if (Array.isArray(input.fields) && (out.fields as unknown[]).length !== input.fields.length)
      throw new Error('unsupported-fields');
    if (input.ids === 'recently-active') out.ids = input.ids;
    else if (Array.isArray(input.ids))
      out.ids = input.ids.map((id) => (typeof id === 'number' ? this.id(id) : this.hash(id)));
    if (method === 'free-space' && typeof input.path === 'string') out.path = this.path(input.path);
    if (Object.keys(input).some((key) => !['fields', 'ids', 'path'].includes(key)))
      throw new Error('unsupported-arguments');
    return out;
  }
  response(method: string, data: Record<string, unknown>, tag: number) {
    const out: Record<string, unknown> = {};
    if ('result' in data)
      out.result =
        data.result === 'success'
          ? 'success'
          : typeof data.result === 'string'
            ? 'Recorded business failure'
            : data.result === null
              ? null
              : 0;
    if ('tag' in data) out.tag = data.tag === tag ? '$request' : '$wrong';
    if ('arguments' in data) {
      const args = data.arguments;
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        out.arguments = args === null ? null : 0;
        return out;
      }
      const values = args as Record<string, unknown>;
      if (method === 'torrent-get') {
        const result: Record<string, unknown> = {};
        if ('torrents' in values)
          result.torrents = Array.isArray(values.torrents)
            ? values.torrents.map((row) => this.torrent(row))
            : null;
        if (Array.isArray(values.removed)) result.removed = values.removed.map((id) => this.id(id));
        out.arguments = result;
      } else if (method === 'session-get') out.arguments = this.session(values);
      else out.arguments = this.numbers(values);
    }
    return out;
  }
  ui(input: Record<string, unknown>) {
    const defaults = defaultSettings().ui;
    const out: Record<string, unknown> = {};
    for (const key of uiFields) {
      const value = input[key];
      if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (typeof value === 'string' && /^[a-zA-Z0-9-]{1,32}$/.test(value))
      )
        out[key] = value;
    }
    if (Array.isArray(input.columns))
      out.columns = input.columns
        .filter((col) => defaults.columns.some((known) => known.key === col.key))
        .map((col) => ({ key: col.key, width: Number(col.width), visible: Boolean(col.visible) }));
    return out;
  }
}
