/** Aggregate a bitfield into bounded cells instead of rendering one DOM node per piece. */
export function pieceSegments(encoded: string, count: number, maximum = 512): number[] {
  if (!Number.isSafeInteger(count) || count <= 0 || maximum < 1) return [];
  let bytes: string;
  try {
    bytes = atob(encoded);
  } catch {
    return [];
  }
  const cells = Math.min(count, maximum),
    result: number[] = [];
  for (let cell = 0; cell < cells; cell++) {
    const from = Math.floor((cell * count) / cells),
      to = Math.floor(((cell + 1) * count) / cells);
    let complete = 0;
    for (let piece = from; piece < to; piece++)
      if (((bytes.charCodeAt(piece >> 3) || 0) & (128 >> (piece % 8))) !== 0) complete++;
    result.push(complete / (to - from));
  }
  return result;
}
