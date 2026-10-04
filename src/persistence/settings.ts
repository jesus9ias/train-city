import { z } from 'zod';
import type { ViewStore } from '../state/viewStore';
import { STORAGE_KEYS, type SafeStorage } from './storage';

const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  showGrid: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export function loadSettings(storage: SafeStorage): Settings | null {
  const raw = storage.read(STORAGE_KEYS.settings);
  if (raw === null) return null;
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Applies saved preferences to the view and keeps them saved as they change. */
export function syncSettings(storage: SafeStorage, view: ViewStore): () => void {
  const saved = loadSettings(storage);
  if (saved && saved.showGrid !== view.getState().showGrid) view.getState().toggleGrid();
  return view.subscribe((state, prev) => {
    if (state.showGrid === prev.showGrid) return;
    const settings: Settings = { schemaVersion: 1, showGrid: state.showGrid };
    storage.write(STORAGE_KEYS.settings, JSON.stringify(settings));
  });
}
