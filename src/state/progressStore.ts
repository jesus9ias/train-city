import { createStore } from 'zustand/vanilla';
import type { Outcome } from '../core/game/state';
import type { LevelIndexEntry } from '../data/schemas/level';

export type LevelResult = { readonly stars: number; readonly bestScore: number };

export type ProgressState = {
  /** Best result per completed level. */
  readonly results: Readonly<Record<string, LevelResult>>;
  /** Keeps the best stars and the best score separately (spec.md §8.7 "Best result is kept"). */
  record: (levelId: string, outcome: Outcome) => void;
  replace: (results: Readonly<Record<string, LevelResult>>) => void;
};

export type ProgressStore = ReturnType<typeof createProgressStore>;

export function createProgressStore() {
  return createStore<ProgressState>()((set, get) => ({
    results: {},
    record: (levelId, outcome) => {
      if (outcome.kind !== 'completed') return;
      const previous = get().results[levelId];
      const next: LevelResult = {
        stars: Math.max(previous?.stars ?? 0, outcome.stars),
        bestScore: Math.max(previous?.bestScore ?? -Infinity, outcome.score),
      };
      if (previous?.stars === next.stars && previous.bestScore === next.bestScore) return;
      set({ results: { ...get().results, [levelId]: next } });
    },
    replace: (results) => {
      set({ results });
    },
  }));
}

/** A level is playable if the index unlocks it or the previous level was completed. */
export function isUnlocked(
  levels: readonly LevelIndexEntry[],
  results: Readonly<Record<string, LevelResult>>,
  levelId: string,
): boolean {
  const index = levels.findIndex((l) => l.id === levelId);
  const level = levels[index];
  if (!level) return false;
  if (level.unlocked) return true;
  const previous = levels[index - 1];
  return previous !== undefined && results[previous.id] !== undefined;
}

/** The next level in the index after `levelId`, if any. */
export function nextLevelId(levels: readonly LevelIndexEntry[], levelId: string): string | null {
  const index = levels.findIndex((l) => l.id === levelId);
  return levels[index + 1]?.id ?? null;
}
