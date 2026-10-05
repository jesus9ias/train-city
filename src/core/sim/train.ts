import type { Cell } from '../grid/coords';
import type { Port } from '../grid/ports';

/** How a vehicle crosses one cell: entering through `entry`, leaving through `exit`. */
export type CellPass = {
  readonly cell: Cell;
  readonly entry: Port;
  /** null = dead end (buffer stop): the route ends at the cell center. */
  readonly exit: Port | null;
};

export type Wagon = {
  readonly model: string;
  readonly cargo: string | null;
  readonly amount: number;
};

export type TrainStatus =
  | 'stopped'
  | 'running'
  | 'loading'
  | 'blocked'
  /** Stopped at a red signal (spec.md §4.10.1). */
  | 'waiting'
  | 'derailed'
  | 'out_of_fuel';

/** A one-directional train: the locomotive always leads (spec.md §4.7–4.8). */
export type TrainState = {
  readonly id: string;
  readonly locomotive: string;
  readonly wagons: readonly Wagon[];
  /** The locomotive's cell. */
  readonly head: CellPass;
  /** Distance travelled along the head cell's route, in cell units. */
  readonly progress: number;
  /** Cells behind the locomotive, nearest first; one per wagon. */
  readonly trail: readonly CellPass[];
  /** Current speed in cell units per second. */
  readonly speed: number;
  /** True while the player wants the train moving. */
  readonly running: boolean;
  readonly status: TrainStatus;
  readonly fuel: number;
  readonly autoRefuel: boolean;
  /** Seconds left at the current station stop (status `loading`). */
  readonly dwellRemaining: number;
  /** Station this train last stopped at, until it leaves its platform (avoids re-stopping). */
  readonly lastStation: string | null;
  /** Price of locomotive + wagons, base for scrap refunds. */
  readonly purchaseValue: number;
  /** Everything paid when buying it (vehicles + initial fuel). */
  readonly paid: number;
  readonly placedInSession: number;
};

/** Every cell a train occupies: the locomotive's and its wagons'. */
export function trainCells(train: TrainState): Cell[] {
  return [train.head.cell, ...train.trail.map((pass) => pass.cell)];
}
