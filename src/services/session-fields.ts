export interface SettingField {
  key: string;
  type: 'boolean' | 'number' | 'string';
  min?: number;
  max?: number;
  version?: number;
  group: string;
}
const booleans = [
  'alt-speed-enabled',
  'alt-speed-time-enabled',
  'blocklist-enabled',
  'dht-enabled',
  'download-queue-enabled',
  'idle-seeding-limit-enabled',
  'incomplete-dir-enabled',
  'lpd-enabled',
  'pex-enabled',
  'peer-port-random-on-start',
  'port-forwarding-enabled',
  'queue-stalled-enabled',
  'rename-partial-files',
  'seed-queue-enabled',
  'seedRatioLimited',
  'speed-limit-down-enabled',
  'speed-limit-up-enabled',
  'start-added-torrents',
  'trash-original-torrent-files',
  'utp-enabled',
  'script-torrent-done-enabled',
];
const numbers = [
  'alt-speed-down',
  'alt-speed-up',
  'cache-size-mb',
  'download-queue-size',
  'idle-seeding-limit',
  'peer-limit-global',
  'peer-limit-per-torrent',
  'queue-stalled-minutes',
  'seed-queue-size',
  'seedRatioLimit',
  'speed-limit-down',
  'speed-limit-up',
];
const strings = ['blocklist-url', 'download-dir', 'incomplete-dir', 'script-torrent-done-filename'];
export const SESSION_FIELDS: SettingField[] = [
  ...booleans.map((key) => ({
    key,
    type: 'boolean' as const,
    group: key.includes('speed') ? 'speed' : 'general',
  })),
  ...numbers.map((key) => ({
    key,
    type: 'number' as const,
    min: 0,
    group: key.includes('speed') ? 'speed' : 'general',
  })),
  ...strings.map((key) => ({ key, type: 'string' as const, group: 'general' })),
  { key: 'encryption', type: 'string', group: 'network' },
  { key: 'peer-port', type: 'number', min: 1, max: 65535, group: 'network' },
  { key: 'alt-speed-time-begin', type: 'number', min: 0, max: 1439, group: 'speed' },
  { key: 'alt-speed-time-end', type: 'number', min: 0, max: 1439, group: 'speed' },
  { key: 'alt-speed-time-day', type: 'number', min: 0, max: 127, group: 'speed' },
  { key: 'default-trackers', type: 'string', version: 17, group: 'general' },
  ...['script-torrent-added', 'script-torrent-done-seeding'].flatMap((prefix) => [
    { key: `${prefix}-enabled`, type: 'boolean' as const, version: 17, group: 'general' },
    { key: `${prefix}-filename`, type: 'string' as const, version: 17, group: 'general' },
  ]),
];
export function validateSessionPatch(
  patch: Record<string, unknown>,
  rpcVersion: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = SESSION_FIELDS.find((x) => x.key === key);
    if (!field || (field.version ?? 16) > rpcVersion)
      throw new Error(`Unsupported setting: ${key}`);
    if (
      typeof value !== field.type ||
      (typeof value === 'number' &&
        (!Number.isFinite(value) ||
          value < (field.min ?? -Infinity) ||
          value > (field.max ?? Infinity)))
    )
      throw new Error(`Invalid value: ${key}`);
    if (key === 'encryption' && !['required', 'preferred', 'tolerated'].includes(String(value)))
      throw new Error('Invalid encryption mode');
    result[key] = value;
  }
  return result;
}
