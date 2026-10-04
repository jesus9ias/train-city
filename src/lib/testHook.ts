import type { Cell } from '../core/grid/coords';
import type { AppStores } from '../state/stores';

export type TestHook = {
  stores: AppStores;
  /** Center of a cell in canvas pixels, registered by the world scene. */
  cellToCanvas?: (cell: Cell) => { x: number; y: number };
};

declare global {
  interface Window {
    __TRAINCITY__?: TestHook;
  }
}

/** Exposes app internals to E2E tests. Only active in dev and test builds (spec.md §10.3). */
export function installTestHook(stores: AppStores): void {
  if (!import.meta.env.DEV) return;
  window.__TRAINCITY__ = { stores };
}

/** Registers an extra test probe; a no-op outside dev and test builds. */
export function exposeForTests<K extends Exclude<keyof TestHook, 'stores'>>(
  name: K,
  value: TestHook[K],
): void {
  if (!import.meta.env.DEV || !window.__TRAINCITY__) return;
  window.__TRAINCITY__[name] = value;
}
