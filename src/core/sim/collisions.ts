import type { Cell } from '../grid/coords';
import { cellKey } from '../world/world';
import type { CellPass, TrainState } from './train';

/** Two trains that hit each other in one tick, and where. */
export type Collision = { readonly a: TrainState; readonly b: TrainState; readonly cell: Cell };

const passesOf = (train: TrainState): readonly CellPass[] => [train.head, ...train.trail];

/**
 * Two vehicles in the same cell collide unless their routes share no port: that is only
 * possible on an X crossing through different routes (spec.md §4.10).
 */
function sharePort(a: CellPass, b: CellPass): boolean {
  return a.entry === b.entry || a.entry === b.exit || a.exit === b.entry || a.exit === b.exit;
}

/** Cells a train entered this tick: occupied now, but not at the start of the tick. */
function enteredCells(before: TrainState | undefined, after: TrainState): Set<string> {
  const start = new Set(before ? passesOf(before).map((p) => cellKey(p.cell)) : []);
  return new Set(
    passesOf(after)
      .map((p) => cellKey(p.cell))
      .filter((key) => !start.has(key)),
  );
}

/**
 * Finds every pair of trains that collided during a tick, in train order (deterministic):
 * - they end the tick on the same cell (except different routes of an X crossing), or
 * - they swapped cells head-on: each entered a cell the other occupied when the tick began.
 *
 * `before` holds the trains as they were when the tick began (matched by id).
 */
export function findCollisions(
  before: readonly TrainState[],
  after: readonly TrainState[],
): Collision[] {
  const previous = new Map(before.map((t) => [t.id, t]));
  const cellsAtStart = new Map(
    before.map((t) => [t.id, new Set(passesOf(t).map((p) => cellKey(p.cell)))]),
  );
  const entered = new Map(after.map((t) => [t.id, enteredCells(previous.get(t.id), t)]));
  const collisions: Collision[] = [];

  for (let i = 0; i < after.length; i++) {
    const a = after[i];
    if (!a) continue;
    const passesA = passesOf(a);
    for (let j = i + 1; j < after.length; j++) {
      const b = after[j];
      if (!b) continue;
      const shared = passesOf(b).find((pb) =>
        passesA.some(
          (pa) => pa.cell.x === pb.cell.x && pa.cell.y === pb.cell.y && sharePort(pa, pb),
        ),
      );
      if (shared) {
        collisions.push({ a, b, cell: shared.cell });
        continue;
      }
      const startA = cellsAtStart.get(a.id);
      const startB = cellsAtStart.get(b.id);
      const enteredA = entered.get(a.id) ?? new Set<string>();
      const enteredB = entered.get(b.id) ?? new Set<string>();
      const hitByA = [...enteredA].find((key) => startB?.has(key));
      const hitByB = [...enteredB].find((key) => startA?.has(key));
      if (hitByA !== undefined && hitByB !== undefined) {
        collisions.push({ a, b, cell: a.head.cell });
      }
    }
  }
  return collisions;
}

/** True when two trains share a cell in a way that is not allowed (state invariant 11). */
export function hasOverlap(trains: readonly TrainState[]): boolean {
  return findCollisions(trains, trains).length > 0;
}
