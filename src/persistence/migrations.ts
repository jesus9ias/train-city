import { CURRENT_SAVE_VERSION } from '../data/schemas/save';
import type { Result } from '../data/validate';

export type RawSave = Record<string, unknown> & { schemaVersion: number };

/** Upgrades a save from version `n` to `n + 1`. */
export type Migration = (save: RawSave) => RawSave;

/**
 * Chained save migrations, keyed by the version they upgrade FROM. Each one ships with a test
 * that uses a real fixture of the old format (spec.md §7.3).
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /** v1 → v2 (Stage 4): saves gain trains and the run state; v1 games had neither. */
  1: (save) => {
    const world = (save['world'] ?? {}) as Record<string, unknown>;
    const editor = (save['editor'] ?? {}) as Record<string, unknown>;
    return {
      ...save,
      schemaVersion: 2,
      world: { ...world, trains: [] },
      run: { elapsedTicks: 0, paused: false },
      editor: { ...editor, nextTrainId: 1 },
    };
  },
  /**
   * v2 → v3 (Stage 5): trains gain station-stop fields; the run gains cargo and fuel metrics.
   * Station inventories start from each supply's `initial` amount, as in a fresh level.
   */
  2: (save) => {
    type RawStation = { id: string; supplies?: { cargo: string; initial: number }[] };
    const world = (save['world'] ?? {}) as Record<string, unknown> & {
      stations?: RawStation[];
      trains?: Record<string, unknown>[];
    };
    const run = (save['run'] ?? {}) as Record<string, unknown>;
    const inventories = Object.fromEntries(
      (world.stations ?? []).map((s) => [
        s.id,
        Object.fromEntries((s.supplies ?? []).map((x) => [x.cargo, x.initial])),
      ]),
    );
    return {
      ...save,
      schemaVersion: 3,
      world: {
        ...world,
        trains: (world.trains ?? []).map((t) => ({ ...t, dwellRemaining: 0, lastStation: null })),
      },
      run: {
        ...run,
        inventories,
        delivered: {},
        lost: {},
        fuelUsedTotal: 0,
        fuelUsedByTrain: {},
        fuelBoughtTotal: 0,
        outcome: null,
      },
    };
  },
  /** v3 → v4 (Stage 9): trains may be `waiting` at a signal; every v3 save is a valid v4 save. */
  3: (save) => ({ ...save, schemaVersion: 4 }),
};

export function migrate(
  save: RawSave,
  target: number = CURRENT_SAVE_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Result<RawSave> {
  if (save.schemaVersion > target) {
    return {
      ok: false,
      issues: [
        {
          path: 'schemaVersion',
          message: `This save was made with a newer version of the game (save format ${save.schemaVersion}, supported ${target})`,
        },
      ],
    };
  }
  let current = save;
  while (current.schemaVersion < target) {
    const step = migrations[current.schemaVersion];
    if (!step) {
      return {
        ok: false,
        issues: [
          {
            path: 'schemaVersion',
            message: `No migration from save format ${current.schemaVersion}`,
          },
        ],
      };
    }
    const from = current.schemaVersion;
    current = step(current);
    if (current.schemaVersion !== from + 1) {
      throw new Error(`Migration from v${from} must produce v${from + 1}`);
    }
  }
  return { ok: true, value: current };
}
