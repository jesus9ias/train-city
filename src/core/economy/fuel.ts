import type { Catalogs, TerrainDef } from '../../data/schemas/catalogs';
import type { TrainState } from '../sim/train';

/** Total weight of a train: locomotive, empty wagons and their cargo (spec.md §4.9). */
export function trainWeight(train: TrainState, catalogs: Catalogs): number {
  const loco = catalogs.locomotives[train.locomotive];
  return train.wagons.reduce((sum, wagon) => {
    const def = catalogs.wagons[wagon.model];
    const perUnit = wagon.cargo ? (catalogs.cargoTypes[wagon.cargo]?.weightPerUnit ?? 0) : 0;
    return sum + (def?.emptyWeight ?? 0) + wagon.amount * perUnit;
  }, loco?.weight ?? 0);
}

/** Fuel burned per distance unit (one cell side) on the given terrain. */
export function fuelPerUnit(
  train: TrainState,
  catalogs: Catalogs,
  terrain: TerrainDef | undefined,
): number {
  const loco = catalogs.locomotives[train.locomotive];
  if (!loco) return 0;
  const loadFactor = trainWeight(train, catalogs) / loco.weight;
  return loco.fuelPerUnit * loadFactor * (terrain?.fuelMultiplier ?? 1);
}
