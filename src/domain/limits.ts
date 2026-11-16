import type { Torrent, TorrentTarget, Session } from './types';
import { safeCount } from './status';
export const LIMIT_FIELDS = ['downloadLimited', 'downloadLimit', 'uploadLimited', 'uploadLimit'];
export type LimitMode = 'keep' | 'disable' | 'limit';
export type LimitIntent = Record<'download' | 'upload', { mode: LimitMode; value: number | null }>;
export type LimitBaseline = { target: TorrentTarget; row: Torrent };
export function limitPatch(
  baseline: Torrent,
  current: Torrent,
  intent: LimitIntent,
  session?: Session,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const direction of ['download', 'upload'] as const) {
    const { mode, value } = intent[direction];
    if (mode === 'keep') continue;
    const enabled = `${direction}Limited`,
      limit = `${direction}Limit`;
    if (mode !== 'disable' && mode !== 'limit') throw new Error('Invalid limit intent');
    if (mode === 'limit' && safeCount(value) === undefined)
      throw new Error('Limit must be a nonnegative safe integer KB/s');
    if (mode === 'limit' && /^3\.00(?:\D|$)/.test(session?.version ?? '') && value! > 4294967)
      throw new Error('Transmission 3.00 limit exceeds 4294967 KB/s');
    const desired = mode === 'disable' ? { [enabled]: false } : { [enabled]: true, [limit]: value };
    const keys = Object.keys(desired);
    if (keys.every((key) => current[key] === desired[key])) continue;
    for (const key of keys) {
      const valid =
        key === enabled
          ? typeof baseline[key] === 'boolean' && typeof current[key] === 'boolean'
          : safeCount(baseline[key]) !== undefined && safeCount(current[key]) !== undefined;
      if (!valid) throw new Error('Limit baseline unavailable; reload before editing');
      if (baseline[key] !== current[key]) throw new Error('Limit changed; reload before editing');
      if (current[key] !== desired[key]) patch[key] = desired[key];
    }
  }
  return patch;
}
export function limitMatches(row: Torrent, intent: LimitIntent) {
  return (['download', 'upload'] as const).every((direction) => {
    const { mode, value } = intent[direction];
    return (
      mode === 'keep' ||
      (row[`${direction}Limited`] === (mode === 'limit') &&
        (mode === 'disable' || row[`${direction}Limit`] === value))
    );
  });
}
