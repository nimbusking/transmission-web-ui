import { safeCount, progressFraction } from './status';
import type { Torrent } from './types';
import { torrentServers, NO_TRACKER, UNKNOWN_TRACKER } from './navigation';
export function tableBytes(value: unknown, rate = false): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let n = value,
    i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(2)} ${units[i]}${rate ? '/s' : ''}`;
}
export function tableDate(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—';
  const d = new Date(value * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function tableServers(row: Torrent): string {
  const values = torrentServers(row).filter((x) => x !== NO_TRACKER && x !== UNKNOWN_TRACKER);
  return values.length ? values.join(', ') : '—';
}
export function peerCount(total: unknown, active: unknown): string {
  const count = (n: unknown) => (safeCount(n) !== undefined ? String(n) : '—');
  return `${count(total)} (${count(active)})`;
}
export function progressValue(row: Torrent): { checking: boolean; value: number | undefined } {
  const checking = row.status === 2;
  const raw = checking ? row.recheckProgress : row.percentDone;
  return {
    checking,
    value: progressFraction(raw) === undefined ? undefined : progressFraction(raw)! * 100,
  };
}
