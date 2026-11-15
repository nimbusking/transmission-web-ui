import { expect, it } from 'vitest';
import { pieceSegments } from '../../src/domain/pieces';
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
