/** RPC sentinels, missing fields and non-numeric values are not a real zero. */
export function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function safeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
export function heldBytes(row: {
  haveValid?: unknown;
  haveUnchecked?: unknown;
  totalSize?: unknown;
  metadataPercentComplete?: unknown;
}): number | undefined {
  const valid = safeCount(row.haveValid),
    unchecked = safeCount(row.haveUnchecked);
  if (valid === undefined || unchecked === undefined) return undefined;
  const sum = safeCount(valid + unchecked),
    total = safeCount(row.totalSize);
  return sum !== undefined &&
    !(row.metadataPercentComplete === 1 && total !== undefined && sum > total)
    ? sum
    : undefined;
}
export function wantedValue(value: unknown): boolean | undefined {
  return value === true || value === 1 ? true : value === false || value === 0 ? false : undefined;
}
export function priorityValue(value: unknown): number | undefined {
  return value === -1 || value === 0 || value === 1 ? value : undefined;
}
export function progressFraction(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
}
export function progressText(value: unknown, digits = 1): string {
  const fraction = progressFraction(value);
  return fraction === undefined ? '—' : `${(fraction * 100).toFixed(digits)}%`;
}
