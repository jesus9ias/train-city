import { FEATURES } from '../core/constants';
import { checkNetwork, type NetworkReport } from '../core/track/network';
import { rotationStep } from '../core/track/rotation';
import type { Tool } from './editorStore';
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

/**
 * How far R / ↻ turns: the selected piece's own step; otherwise 45° with diagonals (each piece
 * then snaps to a rotation it can take).
 */
export function rotationStepFor(tool: Tool | null, catalogs: Catalogs): 45 | 90 {
  if (tool?.kind === 'track') {
    const piece = catalogs.pieces[tool.piece];
    return piece ? rotationStep(piece) : 90;
  }
  return FEATURES.diagonals ? 45 : 90;
}
