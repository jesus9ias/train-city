import { ZOOM_STEPS } from '../constants';

export type ZoomDirection = 1 | -1;

const ascending: readonly number[] = ZOOM_STEPS;
const descending: readonly number[] = [...ZOOM_STEPS].reverse();

/** Snaps an arbitrary zoom value to the closest allowed step (ties resolve to the lower step). */
export function snapZoom(zoom: number): number {
  return ascending.reduce((best, step) =>
    Math.abs(step - zoom) < Math.abs(best - zoom) ? step : best,
  );
}

/** Moves one zoom step in or out, clamped to the available steps. */
export function stepZoom(zoom: number, direction: ZoomDirection): number {
  const current = snapZoom(zoom);
  const next =
    direction === 1
      ? ascending.find((step) => step > current)
      : descending.find((step) => step < current);
  return next ?? current;
}

/**
 * New camera scroll (one axis) that keeps the world point under `anchor` fixed while the
 * zoom changes from `from` to `to`. Assumes a camera centered on its viewport, as in Phaser:
 * `world = scroll + size / 2 + (screen - size / 2) / zoom`.
 */
export function anchoredScroll(
  scroll: number,
  viewportSize: number,
  anchor: number,
  from: number,
  to: number,
): number {
  const offset = anchor - viewportSize / 2;
  return scroll + offset / from - offset / to;
}
