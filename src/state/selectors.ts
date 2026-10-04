import { checkNetwork, type NetworkReport } from '../core/track/network';
import type { WorldState } from '../core/world/world';
import type { Catalogs } from '../data/schemas/catalogs';
import type { ReadySession } from './gameStore';

const reports = new WeakMap<WorldState, NetworkReport>();

/** Network check for a world, cached per immutable world snapshot. */
export function networkReport(world: WorldState, catalogs: Catalogs): NetworkReport {
  let report = reports.get(world);
  if (!report) {
    report = checkNetwork(world, catalogs.pieces);
    reports.set(world, report);
  }
  return report;
}

/** Trains owned: `2/3` when the level has a train limit, else just the count. */
export function trainCount(session: ReadySession): string {
  const { maxTrains } = session.ctx.rules;
  const count = session.game.trains.length;
  return maxTrains === null ? String(count) : `${count}/${maxTrains}`;
}
