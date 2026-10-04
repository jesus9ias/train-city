import { z } from 'zod';
import type { GameStore } from '../state/gameStore';
import type { ProgressStore } from '../state/progressStore';
import { STORAGE_KEYS, type SafeStorage } from './storage';

const progressSchema = z.object({
  schemaVersion: z.literal(1),
  levels: z.record(z.string(), z.object({ stars: z.int().min(0).max(3), bestScore: z.number() })),
});

/** Loads saved progress (invalid data is ignored), keeps it saved, and records completions. */
export function syncProgress(storage: SafeStorage, progress: ProgressStore, game: GameStore) {
  const raw = storage.read(STORAGE_KEYS.progress);
  if (raw !== null) {
    try {
      const parsed = progressSchema.safeParse(JSON.parse(raw));
      if (parsed.success) progress.getState().replace(parsed.data.levels);
    } catch {
      // Corrupt progress: start fresh rather than break the game.
    }
  }

  const stopSaving = progress.subscribe((state, prev) => {
    if (state.results === prev.results) return;
    storage.write(
      STORAGE_KEYS.progress,
      JSON.stringify({ schemaVersion: 1, levels: state.results }),
    );
  });

  const stopRecording = game.subscribe(({ session }, prev) => {
    if (session.status !== 'ready') return;
    const outcome = session.game.run.outcome;
    const before = prev.session.status === 'ready' ? prev.session.game.run.outcome : null;
    if (outcome && outcome !== before) progress.getState().record(session.levelId, outcome);
  });

  return () => {
    stopSaving();
    stopRecording();
  };
}
