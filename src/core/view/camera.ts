/**
 * Clamps a camera scroll value (one axis) so the map stays in view. Uses Phaser's centered-camera
 * convention: the visible world range is `scroll + size/2 ± size/(2·zoom)`.
 *
 * - If the map (plus margins) fits in the viewport, the map is centered.
 * - Otherwise the visible range may go at most `margin` world pixels past either map edge.
 */
export function clampScroll(
  scroll: number,
  viewportSize: number,
  zoom: number,
  worldSize: number,
  margin = 0,
): number {
  const visible = viewportSize / zoom;
  const centered = worldSize / 2 - viewportSize / 2;
  if (visible >= worldSize + margin * 2) return centered;

  const halfOffset = viewportSize / 2 - visible / 2; // scroll + halfOffset = visible left edge
  const min = -margin - halfOffset;
  const max = worldSize + margin - visible - halfOffset;
  return Math.min(Math.max(scroll, min), max);
}
