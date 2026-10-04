import { CELL_SIZE } from '../constants';

export type Cell = { readonly x: number; readonly y: number };

/** Number of columns and rows for a map of the given pixel size. */
export function gridSize(widthPx: number, heightPx: number): { cols: number; rows: number } {
  return { cols: Math.floor(widthPx / CELL_SIZE), rows: Math.floor(heightPx / CELL_SIZE) };
}

/** Cell containing a world-space pixel, or null when the pixel is outside the map. */
export function pixelToCell(
  px: number,
  py: number,
  widthPx: number,
  heightPx: number,
): Cell | null {
  if (px < 0 || py < 0 || px >= widthPx || py >= heightPx) return null;
  return { x: Math.floor(px / CELL_SIZE), y: Math.floor(py / CELL_SIZE) };
}

/** World-space pixel at the center of a cell. */
export function cellCenter(cell: Cell): { x: number; y: number } {
  return { x: cell.x * CELL_SIZE + CELL_SIZE / 2, y: cell.y * CELL_SIZE + CELL_SIZE / 2 };
}
