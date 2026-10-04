import { CELL_SIZE } from '../constants';
import { routeLength, routePoint, routeShape } from '../track/geometry';
import type { CellPass, TrainState } from './train';

/** Sprite facings available in the MVP (8 with diagonals in Stage 8). */
export type Facing = 'N' | 'E' | 'S' | 'W';

/** Where a vehicle is drawn: world pixels of its center, and the facing of its sprite. */
export type VehiclePose = { readonly x: number; readonly y: number; readonly facing: Facing };

/** Snaps a direction vector to the closest facing. */
export function facingOf(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy > 0 ? 'S' : 'N';
}

/** Pose of a vehicle a fraction `t` (0..1) along its cell's route. */
export function poseIn(pass: CellPass, t: number): VehiclePose {
  const shape = routeShape(pass.entry, pass.exit);
  const clamped = Math.min(Math.max(t, 0), 1);
  const point = routePoint(shape, clamped);
  const a = routePoint(shape, Math.max(0, clamped - 0.05));
  const b = routePoint(shape, Math.min(1, clamped + 0.05));
  return {
    x: (pass.cell.x + point.x) * CELL_SIZE,
    y: (pass.cell.y + point.y) * CELL_SIZE,
    facing: facingOf(b.x - a.x, b.y - a.y),
  };
}

/**
 * Poses of every vehicle (locomotive first). Each vehicle sits at the same fraction of its own
 * cell's route as the locomotive does, so the train reads as one body. `extra` is distance
 * travelled since the last tick, for smooth rendering between ticks.
 */
export function trainPoses(train: TrainState, extra = 0): VehiclePose[] {
  const length = routeLength(train.head.entry, train.head.exit);
  const t = length > 0 ? Math.min(1, (train.progress + extra) / length) : 1;
  return [poseIn(train.head, t), ...train.trail.map((pass) => poseIn(pass, t))];
}
