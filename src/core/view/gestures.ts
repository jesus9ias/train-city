/** Touch gesture rules (spec.md §13.1). Pure helpers: the renderer feeds them pointer data. */

/** A touch that moved at most this far (screen px) between down and up is a tap. */
export const TAP_MAX_MOVE_PX = 10;

/** Pinch ratios (current / starting finger distance) that step the zoom in or out. */
export const PINCH_IN_RATIO = 1.35;
export const PINCH_OUT_RATIO = 1 / PINCH_IN_RATIO;

export type ScreenPoint = { readonly x: number; readonly y: number };

export function isTap(down: ScreenPoint, up: ScreenPoint): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_MAX_MOVE_PX;
}

/**
 * Zoom steps a pinch asks for: +1 when the fingers spread past PINCH_IN_RATIO, −1 when they
 * close past PINCH_OUT_RATIO, else 0. After a step the caller re-bases on the current distance.
 */
export function pinchStep(startDistance: number, distance: number): -1 | 0 | 1 {
  if (startDistance <= 0) return 0;
  const ratio = distance / startDistance;
  if (ratio >= PINCH_IN_RATIO) return 1;
  if (ratio <= PINCH_OUT_RATIO) return -1;
  return 0;
}

export function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Tools that act on a drag; with any other (or none), one finger pans instead. */
export function touchPans(mode: 'editing' | 'running', toolKind: string | null): boolean {
  if (mode === 'running') return true;
  return toolKind === null || toolKind === 'inspect';
}
