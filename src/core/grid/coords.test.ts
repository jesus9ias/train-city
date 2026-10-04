import { describe, expect, it } from 'vitest';
import { cellCenter, gridSize, pixelToCell } from './coords';

describe('gridSize', () => {
  it('maps a 1000x1000 map to 50x50 cells', () => {
    expect(gridSize(1000, 1000)).toEqual({ cols: 50, rows: 50 });
  });
});

describe('pixelToCell', () => {
  it('returns the cell containing the pixel', () => {
    expect(pixelToCell(0, 0, 1000, 1000)).toEqual({ x: 0, y: 0 });
    expect(pixelToCell(19.9, 20, 1000, 1000)).toEqual({ x: 0, y: 1 });
    expect(pixelToCell(999, 999, 1000, 1000)).toEqual({ x: 49, y: 49 });
  });

  it('returns null outside the map', () => {
    expect(pixelToCell(-1, 5, 1000, 1000)).toBeNull();
    expect(pixelToCell(5, -0.1, 1000, 1000)).toBeNull();
    expect(pixelToCell(1000, 5, 1000, 1000)).toBeNull();
    expect(pixelToCell(5, 1000, 1000, 1000)).toBeNull();
  });
});

describe('cellCenter', () => {
  it('returns the center pixel of a cell', () => {
    expect(cellCenter({ x: 2, y: 3 })).toEqual({ x: 50, y: 70 });
  });
});
