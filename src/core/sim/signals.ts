import type { TrackPieceDef } from '../../data/schemas/catalogs';
import type { Cell } from '../grid/coords';
import { neighbor, oppositePort, rotatePort, type Port } from '../grid/ports';
import { piecePorts } from '../track/routes';
import { cellKey, type PlacedTrack, type WorldState } from '../world/world';
import { trainCells, type CellPass, type TrainState } from './train';

type Pieces = Readonly<Record<string, TrackPieceDef>>;

export type SignalAspect = 'red' | 'green';

/** The exit a placed signal guards, or undefined for pieces that are not signals. */
export function protectedExit(piece: TrackPieceDef, rotation: number): Port | undefined {
  return piece.signal === undefined ? undefined : rotatePort(piece.signal, rotation);
}

const indexes = new WeakMap<readonly PlacedTrack[], ReadonlyMap<string, PlacedTrack>>();
const blocks = new WeakMap<readonly PlacedTrack[], Map<string, ReadonlySet<string>>>();

function trackIndex(tracks: readonly PlacedTrack[]): ReadonlyMap<string, PlacedTrack> {
  let index = indexes.get(tracks);
  if (!index) {
    index = new Map(tracks.map((t) => [cellKey(t.at), t]));
    indexes.set(tracks, index);
  }
  return index;
}

/**
 * Keys of the cells in the block beyond `exit` of `cell` (spec.md §4.10.1): every cell reachable
 * through any route of any piece, stopping at other signals. A signal reached from behind ends
 * the block and belongs to it; one reached through its guarded exit is the way into the block
 * from elsewhere (a train on it is waiting to enter), so it is left out. Memoized per track list,
 * which is immutable.
 */
export function blockAhead(
  world: WorldState,
  pieces: Pieces,
  cell: Cell,
  exit: Port,
): ReadonlySet<string> {
  let cache = blocks.get(world.tracks);
  if (!cache) {
    cache = new Map();
    blocks.set(world.tracks, cache);
  }
  const cacheKey = `${cellKey(cell)}>${exit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const index = trackIndex(world.tracks);
  const block = new Set<string>();
  const queue: Cell[] = [];
  const visit = (from: Cell, port: Port) => {
    const next = neighbor(from, port);
    const key = cellKey(next);
    const track = index.get(key);
    const piece = track && pieces[track.piece];
    const entry = oppositePort(port);
    if (block.has(key) || !track || !piece) return;
    if (!piecePorts(piece, track.rotation).includes(entry)) return;
    if (protectedExit(piece, track.rotation) === entry) return;
    block.add(key);
    queue.push(next);
  };
  visit(cell, exit);
  while (queue.length > 0) {
    const current = queue.shift() as Cell;
    const track = index.get(cellKey(current));
    const piece = track && pieces[track.piece];
    if (!track || !piece || piece.signal !== undefined) continue; // signals end the block
    for (const port of piecePorts(piece, track.rotation)) visit(current, port);
  }
  cache.set(cacheKey, block);
  return block;
}

/** True if a train other than `exceptId` has a vehicle in the block. */
export function isBlockOccupied(
  block: ReadonlySet<string>,
  trains: readonly TrainState[],
  exceptId?: string,
): boolean {
  return trains.some(
    (train) => train.id !== exceptId && trainCells(train).some((c) => block.has(cellKey(c))),
  );
}

/**
 * True if a train whose locomotive crosses `head` must wait at the end of it: the cell holds a
 * signal guarding the train's exit and another train is in the block ahead.
 */
export function mustWaitAtSignal(
  world: WorldState,
  pieces: Pieces,
  trains: readonly TrainState[],
  trainId: string,
  head: CellPass,
): boolean {
  if (head.exit === null) return false;
  const track = trackIndex(world.tracks).get(cellKey(head.cell));
  const piece = track && pieces[track.piece];
  if (!track || !piece || protectedExit(piece, track.rotation) !== head.exit) return false;
  return isBlockOccupied(blockAhead(world, pieces, head.cell, head.exit), trains, trainId);
}

/** Aspect of every signal on the map, by cell key; derived, never stored (spec.md §4.10.1). */
export function signalAspects(
  world: WorldState,
  pieces: Pieces,
  trains: readonly TrainState[],
): Map<string, SignalAspect> {
  const aspects = new Map<string, SignalAspect>();
  for (const track of world.tracks) {
    const piece = pieces[track.piece];
    const exit = piece && protectedExit(piece, track.rotation);
    if (!exit) continue;
    const occupied = isBlockOccupied(blockAhead(world, pieces, track.at, exit), trains);
    aspects.set(cellKey(track.at), occupied ? 'red' : 'green');
  }
  return aspects;
}
