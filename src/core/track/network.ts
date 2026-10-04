import type { TrackPieceDef } from '../../data/schemas/catalogs';
import type { Cell } from '../grid/coords';
import { neighbor, type Port } from '../grid/ports';
import { cellKey, type WorldState } from '../world/world';
import { isConnected } from './connectivity';
import { piecePorts } from './routes';

export type NetworkReport = {
  /** Track ports that do not connect to a neighbor (including the map edge). */
  readonly looseEnds: readonly { cell: Cell; port: Port }[];
  /** Buffer stops: trains that reach them can never leave (they cannot reverse). */
  readonly deadEnds: readonly Cell[];
  /** Stations whose track group reaches no other station (only when there are 2+ stations). */
  readonly isolatedStations: readonly string[];
  /** Track in groups that touch no station (only when the level has stations). */
  readonly unusedTracks: readonly Cell[];
  /** Number of separate track groups. */
  readonly groups: number;
};

/** Informational network check for the editor (spec.md §6.1). Never blocks anything. */
export function checkNetwork(
  world: WorldState,
  pieces: Readonly<Record<string, TrackPieceDef>>,
): NetworkReport {
  const byKey = new Map(world.tracks.map((t) => [cellKey(t.at), t]));
  const lookup = (cell: Cell) => byKey.get(cellKey(cell));

  // Union-find over connected tracks.
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(key, root);
    return root;
  };
  for (const key of byKey.keys()) parent.set(key, key);

  const looseEnds: { cell: Cell; port: Port }[] = [];
  const deadEnds: Cell[] = [];
  for (const track of world.tracks) {
    const piece = pieces[track.piece];
    if (!piece) continue;
    if (piece.routes.some(([, to]) => to === null)) deadEnds.push(track.at);
    for (const port of piecePorts(piece, track.rotation)) {
      if (isConnected(lookup, pieces, track.at, port)) {
        parent.set(find(cellKey(track.at)), find(cellKey(neighbor(track.at, port))));
      } else {
        looseEnds.push({ cell: track.at, port });
      }
    }
  }

  const groupOfStation = new Map<string, string>();
  for (const station of world.stations) {
    const first = station.cells[0];
    if (first && byKey.has(cellKey(first))) groupOfStation.set(station.id, find(cellKey(first)));
  }
  const stationsPerGroup = new Map<string, number>();
  for (const group of groupOfStation.values()) {
    stationsPerGroup.set(group, (stationsPerGroup.get(group) ?? 0) + 1);
  }

  const isolatedStations =
    world.stations.length < 2
      ? []
      : world.stations
          .filter((s) => {
            const group = groupOfStation.get(s.id);
            return group === undefined || (stationsPerGroup.get(group) ?? 0) < 2;
          })
          .map((s) => s.id);

  const unusedTracks =
    world.stations.length === 0
      ? []
      : world.tracks.filter((t) => !stationsPerGroup.has(find(cellKey(t.at)))).map((t) => t.at);

  const groups = new Set([...byKey.keys()].map(find)).size;
  return { looseEnds, deadEnds, isolatedStations, unusedTracks, groups };
}
