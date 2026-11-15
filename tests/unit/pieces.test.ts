import { expect, it } from 'vitest';
import { pieceAt, pieceCells, pieceGrid, pieceSegments } from '../../src/domain/pieces';
it('reads BitTorrent bits most-significant first and ignores trailing padding', () => {
  expect(pieceSegments(btoa(String.fromCharCode(0b10100000)), 3)).toEqual([1, 0, 1]);
  expect(pieceSegments(btoa(String.fromCharCode(0b10100000)), 3, 1)).toEqual([2 / 3]);
  expect(pieceSegments('invalid!', 3)).toEqual([]);
});
it('bounds visual cells for very large torrents', () => {
  const segments = pieceSegments(btoa(String.fromCharCode(255).repeat(12500)), 100000);
  expect(segments).toHaveLength(512);
  expect(segments.every((value) => value === 1)).toBe(true);
});
it('4096-piece preview preserves full, mixed and missing segment proportions', () => {
  const bytes = new Uint8Array(512);
  for (let i = 0; i < 4096; i++)
    if (i < 1024 || (i < 3072 && i % 8 < 4)) bytes[i >> 3] |= 128 >> (i % 8);
  const cells = pieceSegments(btoa(String.fromCharCode(...bytes)), 4096);
  expect(cells).toHaveLength(512);
  expect(cells.filter((x) => x === 1)).toHaveLength(128);
  expect(cells.filter((x) => x === 0.5)).toHaveLength(256);
  expect(cells.filter((x) => x === 0)).toHaveLength(128);
});
it('reports exact original ranges, short final-piece bytes and byte-weighted completion', () => {
  const cells = pieceCells(btoa(String.fromCharCode(0b10100000)), 3, 16384, 36864, 1);
  expect(cells).toEqual([{ from: 0, to: 3, size: 36864, progress: 20480 / 36864 }]);
  expect(pieceCells(btoa(String.fromCharCode(0b10100000)), 3, 16384, 36864)[2]).toEqual({
    from: 2,
    to: 3,
    size: 4096,
    progress: 1,
  });
  const uneven = pieceCells(btoa(String.fromCharCode(0b00011000)), 5, 100, 450, 2);
  expect(uneven).toEqual([
    { from: 0, to: 2, size: 200, progress: 0 },
    { from: 2, to: 5, size: 250, progress: 150 / 250 },
  ]);
});
it('does not invent byte sizes for missing or inconsistent metadata', () => {
  for (const [size, total] of [
    [NaN, NaN],
    [16384, 0],
    [16384, 999999],
    [0, 300],
  ]) {
    expect(pieceCells(btoa(String.fromCharCode(0b10100000)), 3, size, total, 1)).toEqual([
      { from: 0, to: 3, size: null, progress: 2 / 3 },
    ]);
  }
  expect(pieceCells('invalid!', 3)).toEqual([]);
  expect(pieceCells('', 0)).toEqual([]);
});
it('fills the available width with larger squares, rejecting gaps and unused final cells', () => {
  const grid = pieceGrid(1000, 512);
  expect(grid.columns).toBe(45);
  expect(grid.side).toBeGreaterThanOrEqual(18);
  expect(grid.step - grid.side).toBe(4);
  expect((grid.columns - 1) * grid.step + grid.side).toBeCloseTo(grid.width);
  expect(pieceAt(1, 1, grid, 512)).toBe(0);
  expect(pieceAt(grid.side + 1, 1, grid, 512)).toBeNull();
  expect(pieceAt(1, grid.side + 1, grid, 512)).toBeNull();
  expect(
    pieceAt(
      (511 % grid.columns) * grid.step + 1,
      Math.floor(511 / grid.columns) * grid.step + 1,
      grid,
      512,
    ),
  ).toBe(511);
  expect(
    pieceAt(
      (512 % grid.columns) * grid.step + 1,
      Math.floor(512 / grid.columns) * grid.step + 1,
      grid,
      512,
    ),
  ).toBeNull();
  expect(pieceAt(-1, 1, grid, 512)).toBeNull();
  expect(pieceAt(grid.width, grid.height, grid, 512)).toBeNull();
  expect(pieceGrid(320, 512).height).toBeGreaterThan(grid.height);
  expect(pieceGrid(320, 4).side).toBeLessThan(22);
  expect(pieceAt(0, 0, pieceGrid(0, 1), 1)).toBe(0);
});
