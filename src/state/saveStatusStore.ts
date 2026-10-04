import { createStore } from 'zustand/vanilla';

export type SaveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'saved'; readonly at: Date }
  | { readonly kind: 'error'; readonly message: string };

export type SaveStatusState = {
  readonly status: SaveStatus;
  setStatus: (status: SaveStatus) => void;
};

export type SaveStatusStore = ReturnType<typeof createSaveStatusStore>;

/** What the autosave is doing, for the "Saved ✓" indicator. */
export function createSaveStatusStore() {
  return createStore<SaveStatusState>()((set) => ({
    status: { kind: 'idle' },
    setStatus: (status) => {
      set({ status });
    },
  }));
}
