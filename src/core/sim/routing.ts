import type { TrackPieceDef } from '../../data/schemas/catalogs';
import { rotatePort, type Port } from '../grid/ports';
import { activeRouteIndex, pieceRoutes, type WorldRoute } from '../track/routes';

/** The other end of a route, seen from `port`. */
function otherEnd([from, to]: WorldRoute, port: Port): Port | null {
  return from === port ? to : from;
}

/**
 * Where a train entering a placed piece through `entry` leaves it (spec.md §4.4):
 * - a port → keep going; `null` → dead end (buffer stop); `undefined` → no route (derailment).
 * - Stateful pieces entered from the trunk follow the active route; entered from a branch
 *   (trailing move) they always lead to the trunk, whatever their state.
 */
export function exitFor(
  piece: TrackPieceDef,
  rotation: number,
  state: number,
  entry: Port,
): Port | null | undefined {
  const routes = pieceRoutes(piece, rotation);
  if (piece.stateful && piece.trunk !== undefined && rotatePort(piece.trunk, rotation) === entry) {
    const active = routes[activeRouteIndex(piece, state)];
    return active ? otherEnd(active, entry) : undefined;
  }
  const route = routes.find(([from, to]) => from === entry || to === entry);
  return route ? otherEnd(route, entry) : undefined;
}

/**
 * The reverse question, used to lay wagons behind a locomotive: which port does a train that
 * leaves through `exit` come from? Prefers the active route of stateful pieces.
 */
export function entryFor(
  piece: TrackPieceDef,
  rotation: number,
  state: number,
  exit: Port,
): Port | undefined {
  const routes = pieceRoutes(piece, rotation);
  const active = routes[activeRouteIndex(piece, state)];
  const candidates = active ? [active, ...routes.filter((r) => r !== active)] : routes;
  for (const route of candidates) {
    if (!route.includes(exit)) continue;
    const entry = otherEnd(route, exit);
    // The train must really be able to leave through `exit` after entering there.
    if (entry !== null && exitFor(piece, rotation, state, entry) === exit) return entry;
  }
  return undefined;
}
