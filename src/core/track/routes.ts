import type { Route, TrackPieceDef } from '../../data/schemas/catalogs';
import { rotatePort, type Port } from '../grid/ports';

/** A route rotated into world orientation. `to === null` means a dead end (buffer stop). */
export type WorldRoute = readonly [from: Port, to: Port | null];

export function rotateRoute([from, to]: Route, rotation: number): WorldRoute {
  return [rotatePort(from, rotation), to === null ? null : rotatePort(to, rotation)];
}

/** All routes of a piece placed with the given rotation. */
export function pieceRoutes(piece: TrackPieceDef, rotation: number): WorldRoute[] {
  return piece.routes.map((route) => rotateRoute(route, rotation));
}

/** Every port a placed piece connects to (dead ends excluded), without duplicates. */
export function piecePorts(piece: TrackPieceDef, rotation: number): Port[] {
  const ports = new Set<Port>();
  for (const [from, to] of pieceRoutes(piece, rotation)) {
    ports.add(from);
    if (to !== null) ports.add(to);
  }
  return [...ports];
}

/** The route currently selected by a stateful piece, or the only route of a simple piece. */
export function activeRouteIndex(piece: TrackPieceDef, state: number | undefined): number {
  if (!piece.stateful) return 0;
  const index = state ?? piece.defaultState ?? 0;
  return index < piece.routes.length ? index : 0;
}
