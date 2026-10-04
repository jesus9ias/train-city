import { createStore } from 'zustand/vanilla';
import { DEFAULT_ZOOM } from '../core/constants';
import type { Cell } from '../core/grid/coords';
import { stepZoom } from '../core/view/zoom';

export type ViewState = {
  zoom: number;
  showGrid: boolean;
  /** Cell under the pointer, or null when the pointer is outside the map. */
  hoverCell: Cell | null;
  /** True once the world scene has finished creating and is accepting input. */
  sceneReady: boolean;
  /** Simulation speed multiplier: how many ticks run per tick of real time. */
  simSpeed: SimSpeed;
  setSimSpeed: (speed: SimSpeed) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleGrid: () => void;
  setHoverCell: (cell: Cell | null) => void;
  setSceneReady: (ready: boolean) => void;
};

export type ViewStore = ReturnType<typeof createViewStore>;

export const SIM_SPEEDS = [1, 2, 4] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

export function createViewStore() {
  return createStore<ViewState>()((set, get) => ({
    zoom: DEFAULT_ZOOM,
    showGrid: true,
    hoverCell: null,
    sceneReady: false,
    simSpeed: 1,
    setSimSpeed: (simSpeed) => {
      set({ simSpeed });
    },
    setZoom: (zoom) => {
      set({ zoom });
    },
    zoomIn: () => {
      set({ zoom: stepZoom(get().zoom, 1) });
    },
    zoomOut: () => {
      set({ zoom: stepZoom(get().zoom, -1) });
    },
    toggleGrid: () => {
      set({ showGrid: !get().showGrid });
    },
    setHoverCell: (cell) => {
      const current = get().hoverCell;
      if (current?.x === cell?.x && current?.y === cell?.y) return;
      set({ hoverCell: cell });
    },
    setSceneReady: (sceneReady) => {
      set({ sceneReady });
    },
  }));
}
