import { createStore } from 'zustand/vanilla';
import type { Cell } from '../core/grid/coords';

export type Tool =
  | { readonly kind: 'track'; readonly piece: string }
  | { readonly kind: 'object'; readonly object: string }
  | { readonly kind: 'terrain'; readonly terrain: string }
  | { readonly kind: 'erase' }
  | { readonly kind: 'rotate' }
  | { readonly kind: 'inspect' }
  | {
      readonly kind: 'train';
      readonly locomotive: string;
      readonly wagons: readonly string[];
    };

export type Notice = {
  readonly id: number;
  readonly text: string;
  readonly tone: 'error' | 'info';
};

/** The train being composed in the palette before placing it. */
export type TrainDraft = { readonly locomotive: string | null; readonly wagons: readonly string[] };

export type EditorState = {
  readonly tool: Tool | null;
  /** Rotation applied to new track pieces (degrees). */
  readonly rotation: number;
  readonly inspected: Cell | null;
  readonly showNetwork: boolean;
  readonly notice: Notice | null;
  /** Train shown in the inspector (and highlighted on the map). */
  readonly selectedTrain: string | null;
  selectTrain: (trainId: string | null) => void;
  readonly trainDraft: TrainDraft;
  /** Updates the draft; if the train tool is active it follows the new composition. */
  setTrainDraft: (draft: TrainDraft) => void;
  selectTool: (tool: Tool | null) => void;
  /** Turns the next piece or train by `step` degrees (90 by default, 45 for diagonal pieces). */
  rotate: (step?: 45 | 90) => void;
  inspect: (cell: Cell | null) => void;
  toggleNetwork: () => void;
  notify: (text: string, tone?: Notice['tone']) => void;
  dismissNotice: (id: number) => void;
  reset: () => void;
};

export type EditorStore = ReturnType<typeof createEditorStore>;

export function sameTool(a: Tool | null, b: Tool | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createEditorStore() {
  let noticeId = 0;
  return createStore<EditorState>()((set, get) => ({
    tool: null,
    rotation: 0,
    inspected: null,
    showNetwork: false,
    notice: null,
    selectedTrain: null,
    selectTrain: (selectedTrain) => {
      set({ selectedTrain });
    },
    trainDraft: { locomotive: null, wagons: [] },
    setTrainDraft: (trainDraft) => {
      const { tool } = get();
      if (tool?.kind === 'train' && trainDraft.locomotive) {
        set({
          trainDraft,
          tool: { kind: 'train', locomotive: trainDraft.locomotive, wagons: trainDraft.wagons },
        });
      } else {
        set({ trainDraft });
      }
    },
    selectTool: (tool) => {
      set({ tool });
    },
    rotate: (step = 90) => {
      const rotation = get().rotation;
      set({ rotation: (rotation - (rotation % step) + step) % 360 });
    },
    inspect: (inspected) => {
      set({ inspected });
    },
    toggleNetwork: () => {
      set({ showNetwork: !get().showNetwork });
    },
    notify: (text, tone = 'error') => {
      noticeId += 1;
      set({ notice: { id: noticeId, text, tone } });
    },
    dismissNotice: (id) => {
      if (get().notice?.id === id) set({ notice: null });
    },
    reset: () => {
      set({ tool: null, rotation: 0, inspected: null, notice: null, selectedTrain: null });
    },
  }));
}
