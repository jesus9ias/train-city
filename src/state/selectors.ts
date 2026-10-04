import { checkNetwork, type NetworkReport } from '../core/track/network';
import type { WorldState } from '../core/world/world';
import type { Catalogs } from '../data/schemas/catalogs';

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
