/** Size of one grid cell in pixels. The minimum unit for terrain, objects and tracks. */
export const CELL_SIZE = 20;

/** Fixed simulation step in milliseconds (20 ticks per second). */
export const TICK_MS = 50;
export const TICK_SECONDS = TICK_MS / 1000;

/** Maximum number of undo steps kept by the editor. */
export const MAX_UNDO = 100;

/** Map size limits and defaults, in pixels. Width and height must be multiples of CELL_SIZE. */
export const MAP_MIN_PX = 200;
export const MAP_MAX_PX = 4000;
export const MAP_DEFAULT_PX = 1000;

/** Discrete camera zoom levels. Integers at or above 1x keep pixel art crisp. */
export const ZOOM_STEPS = [0.5, 1, 2, 3, 4] as const;
export const DEFAULT_ZOOM = 1;

/** Feature flags for capabilities that are modelled but not yet enabled. */
export const FEATURES: { readonly diagonals: boolean } = {
  /** Diagonal ports, 45° pieces and 8 vehicle facings (Stage 8). */
  diagonals: true,
};
