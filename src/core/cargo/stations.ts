import type { StationDef } from '../../data/schemas/level';
import { balance, record, roundMoney, type Ledger } from '../economy/ledger';
import type { CargoAmounts, RulesContext, RunState } from '../game/state';
import type { Cell } from '../grid/coords';
import { neighbor } from '../grid/ports';
import type { CellPass, TrainState, Wagon } from '../sim/train';
import { sameCell, stationAt, type WorldState } from '../world/world';

const add = (amounts: CargoAmounts | undefined, cargo: string, amount: number): CargoAmounts => ({
  ...amounts,
  [cargo]: (amounts?.[cargo] ?? 0) + amount,
});

/**
 * The station a train must stop at in this cell: when its locomotive is on the last platform
 * cell in its direction of travel (spec.md §4.5). MVP: trains stop at every station.
 */
export function stopStationFor(world: WorldState, head: CellPass): StationDef | undefined {
  const station = stationAt(world, head.cell);
  if (!station) return undefined;
  if (head.exit === null) return station;
  const ahead: Cell = neighbor(head.cell, head.exit);
  return station.cells.some((c) => sameCell(c, ahead)) ? undefined : station;
}

/** Stations produce their supplies over time, up to each supply's capacity. */
export function produce(run: RunState, stations: readonly StationDef[], seconds: number): RunState {
  let inventories = run.inventories;
  for (const station of stations) {
    for (const supply of station.supplies) {
      if (supply.ratePerMinute <= 0) continue;
      const current = inventories[station.id]?.[supply.cargo] ?? 0;
      if (current >= supply.capacity) continue;
      const next = Math.min(supply.capacity, current + (supply.ratePerMinute / 60) * seconds);
      inventories = {
        ...inventories,
        [station.id]: { ...inventories[station.id], [supply.cargo]: next },
      };
    }
  }
  return inventories === run.inventories ? run : { ...run, inventories };
}

export type ServiceResult = {
  readonly train: TrainState;
  readonly run: RunState;
  readonly ledger: Ledger;
  /** Money earned by deliveries during this stop. */
  readonly revenue: number;
};

/** Payment per unit of cargo in this level (level overrides win over the catalog). */
export function payPerUnit(ctx: RulesContext, cargo: string): number {
  return ctx.economy.payOverrides[cargo] ?? ctx.catalogs.cargoTypes[cargo]?.payPerUnit ?? 0;
}

/**
 * Everything that happens when a train stops at a station, in order (spec.md §4.5):
 * 1) unload cargo the station demands and get paid, 2) load what it supplies into compatible
 * wagons (whole units), 3) refuel if the station sells fuel, as far as the money allows.
 */
export function serviceTrain(
  train: TrainState,
  station: StationDef,
  run: RunState,
  ledger: Ledger,
  initialMoney: number | null,
  ctx: RulesContext,
): ServiceResult {
  const demanded = new Set(station.demands.map((d) => d.cargo));
  let delivered = run.delivered[station.id];
  let revenue = 0;

  // 1. Unload
  let wagons: Wagon[] = train.wagons.map((wagon) => {
    if (!wagon.cargo || wagon.amount <= 0 || !demanded.has(wagon.cargo)) return wagon;
    delivered = add(delivered, wagon.cargo, wagon.amount);
    revenue += wagon.amount * payPerUnit(ctx, wagon.cargo);
    return { ...wagon, cargo: null, amount: 0 };
  });

  // 2. Load
  let inventory = run.inventories[station.id];
  for (const supply of station.supplies) {
    wagons = wagons.map((wagon) => {
      const available = Math.floor(inventory?.[supply.cargo] ?? 0);
      const def = ctx.catalogs.wagons[wagon.model];
      if (available <= 0 || !def?.accepts.includes(supply.cargo)) return wagon;
      if (wagon.cargo !== null && wagon.cargo !== supply.cargo) return wagon;
      const take = Math.min(available, Math.floor(def.capacity - wagon.amount));
      if (take <= 0) return wagon;
      inventory = add(inventory, supply.cargo, -take);
      return { ...wagon, cargo: supply.cargo, amount: wagon.amount + take };
    });
  }

  let nextLedger = record(ledger, 'revenue', roundMoney(revenue));
  let nextTrain: TrainState = { ...train, wagons };
  let fuelBought = 0;

  // 3. Refuel
  const loco = ctx.catalogs.locomotives[train.locomotive];
  if (loco && train.autoRefuel && station.services.includes('fuel')) {
    const need = loco.fuelCapacity - train.fuel;
    const money = balance(initialMoney, nextLedger);
    const price = ctx.economy.fuelPrice;
    const affordable = money === null || price === 0 ? need : Math.max(0, money / price);
    fuelBought = Math.max(0, Math.min(need, affordable));
    if (fuelBought > 0) {
      nextTrain = { ...nextTrain, fuel: train.fuel + fuelBought };
      nextLedger = record(nextLedger, 'fuel', roundMoney(fuelBought * price));
    }
  }

  return {
    train: nextTrain,
    ledger: nextLedger,
    revenue: roundMoney(revenue),
    run: {
      ...run,
      inventories: inventory ? { ...run.inventories, [station.id]: inventory } : run.inventories,
      delivered: delivered ? { ...run.delivered, [station.id]: delivered } : run.delivered,
      fuelBoughtTotal: run.fuelBoughtTotal + fuelBought,
    },
  };
}
