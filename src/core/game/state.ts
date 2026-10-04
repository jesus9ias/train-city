import type { Catalogs } from '../../data/schemas/catalogs';
import type { Level, StationDef } from '../../data/schemas/level';
import { balance, EMPTY_LEDGER, type Ledger } from '../economy/ledger';
import type { TrainState } from '../sim/train';
import { buildWorld, type WorldState } from '../world/world';

/** `editing`: Editor Mode, simulation paused. `running`: Run Mode (it may still be paused). */
export type GameMode = 'editing' | 'running';

/** Amounts per cargo id. */
export type CargoAmounts = Readonly<Record<string, number>>;

/** How a level ended (spec.md §4.13, §5.1). */
export type Outcome =
  | {
      readonly kind: 'completed';
      readonly stars: number;
      /** Net profit: final money − initial money. */
      readonly score: number;
      readonly seconds: number;
      readonly fuelUsed: number;
      readonly buildCost: number;
    }
  | { readonly kind: 'failed'; readonly reason: string };

/** What accumulates while the simulation runs. */
export type RunState = {
  /** Cargo waiting at each station, by station id. */
  readonly inventories: Readonly<Record<string, CargoAmounts>>;
  /** Cargo delivered to each station, by station id. */
  readonly delivered: Readonly<Record<string, CargoAmounts>>;
  /** Cargo destroyed (crashes, Stage 6). */
  readonly lost: CargoAmounts;
  readonly fuelUsedTotal: number;
  readonly fuelUsedByTrain: Readonly<Record<string, number>>;
  readonly fuelBoughtTotal: number;
  readonly outcome: Outcome | null;
};

/** Everything that changes while playing a level. Plain data, serializable. */
export type GameState = {
  readonly world: WorldState;
  readonly trains: readonly TrainState[];
  readonly ledger: Ledger;
  readonly run: RunState;
  /** null = unlimited money (sandbox). */
  readonly initialMoney: number | null;
  readonly mode: GameMode;
  /** Run Mode only: the player paused the simulation. */
  readonly paused: boolean;
  /** Simulated time, in fixed ticks (spec.md §4.11). Never changes in Editor Mode. */
  readonly elapsedTicks: number;
  /** Increments every time the player leaves the editor (spec.md §6.1). */
  readonly editorSession: number;
  /** Counters for stable entity ids. */
  readonly nextObjectId: number;
  readonly nextTrainId: number;
};

/** Level rules the editor and simulation need, alongside the catalogs. */
export type RulesContext = {
  readonly catalogs: Catalogs;
  readonly rules: Level['editorRules'];
  readonly economy: Level['economy'];
  readonly objectives: Level['objectives'];
  readonly constraints: Level['constraints'];
  readonly scoring: Level['scoring'];
};

/** Station inventories at the start of a level: each supply's `initial` amount. */
export function initialInventories(
  stations: readonly StationDef[],
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    stations.map((s) => [s.id, Object.fromEntries(s.supplies.map((x) => [x.cargo, x.initial]))]),
  );
}

export function emptyRun(stations: readonly StationDef[]): RunState {
  return {
    inventories: initialInventories(stations),
    delivered: {},
    lost: {},
    fuelUsedTotal: 0,
    fuelUsedByTrain: {},
    fuelBoughtTotal: 0,
    outcome: null,
  };
}

export function createGameState(level: Level, catalogs: Catalogs): GameState {
  const world = buildWorld(level, catalogs);
  return {
    world,
    trains: [],
    ledger: EMPTY_LEDGER,
    run: emptyRun(world.stations),
    initialMoney: level.economy.initialMoney,
    mode: 'editing',
    paused: false,
    elapsedTicks: 0,
    editorSession: 1,
    nextObjectId: world.objects.length + 1,
    nextTrainId: 1,
  };
}

export function rulesContext(level: Level, catalogs: Catalogs): RulesContext {
  return {
    catalogs,
    rules: level.editorRules,
    economy: level.economy,
    objectives: level.objectives,
    constraints: level.constraints,
    scoring: level.scoring,
  };
}

export function moneyOf(state: GameState): number | null {
  return balance(state.initialMoney, state.ledger);
}

/** True when the simulation clock should advance. */
export function isSimulating(state: GameState): boolean {
  return state.mode === 'running' && !state.paused && state.run.outcome === null;
}
