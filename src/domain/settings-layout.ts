export const SETTINGS_TABS = [
  'basic',
  'network',
  'bandwidth',
  'schedule',
  'folders',
  'extra',
  'labels',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const SESSION_GROUPS: Record<string, string[]> = {
  basic: [
    'download-dir',
    'incomplete-dir-enabled',
    'incomplete-dir',
    'rename-partial-files',
    'start-added-torrents',
    'trash-original-torrent-files',
    'cache-size-mb',
    'script-torrent-done-enabled',
    'script-torrent-done-filename',
    'script-torrent-added-enabled',
    'script-torrent-added-filename',
    'script-torrent-done-seeding-enabled',
    'script-torrent-done-seeding-filename',
  ],
  network: [
    'download-queue-enabled',
    'download-queue-size',
    'seed-queue-enabled',
    'seed-queue-size',
    'encryption',
    'peer-port-random-on-start',
    'peer-port',
    'port-forwarding-enabled',
    'lpd-enabled',
    'utp-enabled',
    'dht-enabled',
    'pex-enabled',
    'blocklist-enabled',
    'blocklist-url',
    'default-trackers',
  ],
  bandwidth: [
    'speed-limit-down-enabled',
    'speed-limit-down',
    'speed-limit-up-enabled',
    'speed-limit-up',
    'peer-limit-global',
    'peer-limit-per-torrent',
    'seedRatioLimited',
    'seedRatioLimit',
    'idle-seeding-limit-enabled',
    'idle-seeding-limit',
    'queue-stalled-enabled',
    'queue-stalled-minutes',
  ],
  schedule: [
    'alt-speed-down',
    'alt-speed-up',
    'alt-speed-time-enabled',
    'alt-speed-time-begin',
    'alt-speed-time-end',
    'alt-speed-time-day',
    'alt-speed-enabled',
  ],
};
export const FIELD_DEPENDENCIES: Record<string, string> = {
  'incomplete-dir': 'incomplete-dir-enabled',
  'download-queue-size': 'download-queue-enabled',
  'seed-queue-size': 'seed-queue-enabled',
  'blocklist-url': 'blocklist-enabled',
  'speed-limit-down': 'speed-limit-down-enabled',
  'speed-limit-up': 'speed-limit-up-enabled',
  seedRatioLimit: 'seedRatioLimited',
  'idle-seeding-limit': 'idle-seeding-limit-enabled',
  'queue-stalled-minutes': 'queue-stalled-enabled',
  'alt-speed-time-begin': 'alt-speed-time-enabled',
  'alt-speed-time-end': 'alt-speed-time-enabled',
  'alt-speed-time-day': 'alt-speed-time-enabled',
  ...Object.fromEntries(
    ['script-torrent-done', 'script-torrent-added', 'script-torrent-done-seeding'].map((prefix) => [
      `${prefix}-filename`,
      `${prefix}-enabled`,
    ]),
  ),
};
export function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function timeToMinutes(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Invalid schedule time');
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
export function setWeekday(mask: number, day: number, checked: boolean) {
  return checked ? mask | (1 << day) : mask & ~(1 << day);
}
