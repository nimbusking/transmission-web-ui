/** RPC sentinels, missing fields and non-numeric values are not a real zero. */
export function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
