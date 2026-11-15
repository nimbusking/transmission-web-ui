export interface PieceCell {
  /** Zero-based, end-exclusive range in the original bitfield. */
  from: number;
  to: number;
  size: number | null;
  progress: number;
}
/** Aggregate once per bitfield update, including the shorter last piece when sizes are known. */
export function pieceCells(
  encoded: string,
  count: number,
  pieceSize = 1,
  totalSize = count * pieceSize,
  maximum = 512,
): PieceCell[] {
  if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(maximum) || maximum < 1)
    return [];
  let bytes: string;
  try {
    bytes = atob(encoded);
  } catch {
    return [];
  }
  const cells = Math.min(count, maximum),
    sized =
      Number.isSafeInteger(pieceSize) &&
      pieceSize > 0 &&
      Number.isSafeInteger(totalSize) &&
      totalSize > (count - 1) * pieceSize &&
      totalSize <= count * pieceSize,
    result: PieceCell[] = [];
  for (let cell = 0; cell < cells; cell++) {
    const from = Math.floor((cell * count) / cells),
      to = Math.floor(((cell + 1) * count) / cells),
      size = sized ? Math.min(to * pieceSize, totalSize) - from * pieceSize : null;
    let complete = 0;
    for (let piece = from; piece < to; piece++)
      if (((bytes.charCodeAt(piece >> 3) || 0) & (128 >> (piece % 8))) !== 0)
        complete += sized ? Math.min(pieceSize, totalSize - piece * pieceSize) : 1;
    result.push({ from, to, size, progress: complete / (size ?? to - from) });
  }
  return result;
}
/** Preserve the bit-count-only aggregation for consumers without byte metadata. */
export function pieceSegments(encoded: string, count: number, maximum = 512): number[] {
  return pieceCells(encoded, count, 1, count, maximum).map((cell) => cell.progress);
}
export function pieceGrid(availableWidth: number, count: number) {
  const width = Math.max(1, Math.floor(availableWidth)),
    gap = 4,
    columns = Math.max(1, Math.floor((width + gap) / (18 + gap))),
    step = (width + gap) / columns,
    side = Math.max(1, step - gap),
    rows = Math.max(1, Math.ceil(count / columns));
  return { width, height: rows * step - gap, columns, step, side };
}
export function pieceAt(
  x: number,
  y: number,
  grid: ReturnType<typeof pieceGrid>,
  count: number,
): number | null {
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
  const column = Math.floor(x / grid.step),
    row = Math.floor(y / grid.step),
    index = row * grid.columns + column;
  return column < grid.columns &&
    index < count &&
    x - column * grid.step < grid.side &&
    y - row * grid.step < grid.side
    ? index
    : null;
}
