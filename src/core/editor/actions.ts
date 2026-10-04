import { canAfford, record, roundMoney } from '../economy/ledger';
import type { GameState, RulesContext } from '../game/state';
import type { Cell } from '../grid/coords';
import type { Port } from '../grid/ports';
import { canPlaceAt, rotationStep } from '../track/rotation';
import { routeLength } from '../track/geometry';
import { layoutTrainFacing, trainAt } from '../sim/placement';
import type { TrainState } from '../sim/train';
import {
  cellIndex,
  footprintCells,
  inBounds,
  objectAt,
  sameCell,
  stationAt,
  terrainAt,
  trackAt,
  type PlacedTrack,
  type WorldState,
} from '../world/world';

/** Player-facing reasons why an editor action is rejected. */
export const REASONS = {
  notAllowed: 'Not allowed in this level',
  invalidRotation: 'Invalid rotation',
  outside: 'Outside the map',
  doesNotFit: 'Does not fit inside the map',
  occupied: 'Cell occupied',
  notBuildable: 'Terrain not buildable',
  terrainNotAllowed: 'Terrain not allowed',
  noMoney: 'Not enough money',
  locked: 'Locked level element',
  partOfStation: 'Part of a station',
  notRemovable: 'Cannot be removed',
  nothingToErase: 'Nothing to erase',
  nothingToRotate: 'Nothing to rotate',
  noTerrainEdit: 'Terrain cannot be edited in this level',
  noObjectEdit: 'Objects cannot be edited in this level',
  noChange: 'Nothing would change',
  trainOccupied: 'Occupied by a train',
  notInEditor: 'Switch to Editor Mode to build',
  trainLimit: 'Train limit reached',
  tooManyWagons: 'Too many wagons for this locomotive',
  levelOver: 'The level is over: restart it to play again',
} as const;

export type EditorAction =
  | {
      readonly type: 'placeTrack';
      readonly cell: Cell;
      readonly piece: string;
      readonly rotation: number;
    }
  | { readonly type: 'placeObject'; readonly cell: Cell; readonly object: string }
  | { readonly type: 'erase'; readonly cell: Cell }
  | { readonly type: 'rotateTrack'; readonly cell: Cell }
  | { readonly type: 'paintTerrain'; readonly cells: readonly Cell[]; readonly terrain: string }
  | {
      readonly type: 'placeTrain';
      readonly cell: Cell;
      readonly locomotive: string;
      readonly wagons: readonly string[];
      /** Preferred heading; the closest direction the track allows is used. */
      readonly facing: Port;
    };

export type ActionOutcome =
  | {
      readonly ok: true;
      readonly state: GameState;
      /** Money change: negative = spent, positive = refunded. */
      readonly delta: number;
      readonly label: string;
    }
  | { readonly ok: false; readonly reason: string; readonly label: string };

const fail = (reason: string, label: string): ActionOutcome => ({ ok: false, reason, label });

const isAllowed = (list: readonly string[] | undefined, id: string) =>
  list === undefined || list.includes(id);

const withWorld = (state: GameState, world: Partial<WorldState>): GameState => ({
  ...state,
  world: { ...state.world, ...world },
});

/**
 * Validates and applies an editor action. Pure: the same function powers the ghost preview
 * (outcome discarded) and the real edit (outcome committed to history).
 */
export function applyAction(
  state: GameState,
  ctx: RulesContext,
  action: EditorAction,
): ActionOutcome {
  if (state.run.outcome) return fail(REASONS.levelOver, 'Edit');
  if (state.mode !== 'editing') return fail(REASONS.notInEditor, 'Edit');
  switch (action.type) {
    case 'placeTrain':
      return placeTrain(state, ctx, action);
    case 'placeTrack':
      return placeTrack(state, ctx, action);
    case 'placeObject':
      return placeObject(state, ctx, action);
    case 'erase':
      return erase(state, ctx, action.cell);
    case 'rotateTrack':
      return rotateTrack(state, ctx, action.cell);
    case 'paintTerrain':
      return paintTerrain(state, ctx, action);
  }
}

function placeTrack(
  state: GameState,
  { catalogs, rules }: RulesContext,
  { cell, piece: pieceId, rotation }: Extract<EditorAction, { type: 'placeTrack' }>,
): ActionOutcome {
  const { world } = state;
  const piece = catalogs.pieces[pieceId];
  const label = piece?.name ?? pieceId;
  if (!piece || !isAllowed(rules.allowedPieces, piece.id)) return fail(REASONS.notAllowed, label);
  if (!canPlaceAt(piece, rotation)) return fail(REASONS.invalidRotation, label);
  if (!inBounds(world, cell)) return fail(REASONS.outside, label);
  if (trackAt(world, cell)) return fail(REASONS.occupied, label);
  const object = objectAt(world, catalogs, cell);
  if (object && catalogs.objects[object.type]?.blocksTrack) return fail(REASONS.occupied, label);
  const terrain = catalogs.terrains[terrainAt(world, cell) ?? ''];
  if (!terrain?.buildable) return fail(REASONS.notBuildable, label);

  const cost = roundMoney(piece.cost * terrain.trackCostMultiplier);
  if (!canAfford(state.initialMoney, state.ledger, cost)) return fail(REASONS.noMoney, label);

  const track: PlacedTrack = {
    at: cell,
    piece: piece.id,
    rotation,
    state: piece.stateful ? (piece.defaultState ?? 0) : 0,
    locked: false,
    paid: cost,
    placedInSession: state.editorSession,
  };
  return {
    ok: true,
    state: {
      ...withWorld(state, { tracks: [...world.tracks, track] }),
      ledger: record(state.ledger, 'build', cost),
    },
    delta: -cost,
    label,
  };
}

function placeObject(
  state: GameState,
  { catalogs, rules }: RulesContext,
  { cell, object: objectId }: Extract<EditorAction, { type: 'placeObject' }>,
): ActionOutcome {
  const { world } = state;
  const def = catalogs.objects[objectId];
  const label = def?.name ?? objectId;
  if (!rules.allowObjectEdit) return fail(REASONS.noObjectEdit, label);
  if (!def) return fail(REASONS.notAllowed, label);

  const cells = footprintCells(cell, def.footprint.w, def.footprint.h);
  if (!cells.every((c) => inBounds(world, c))) return fail(REASONS.doesNotFit, label);
  for (const c of cells) {
    const terrain = catalogs.terrains[terrainAt(world, c) ?? ''];
    const allowed = def.allowedTerrains
      ? def.allowedTerrains.includes(terrain?.id ?? '')
      : (terrain?.buildable ?? false);
    if (!allowed) return fail(REASONS.terrainNotAllowed, label);
  }
  for (const c of cells) {
    const blockedByTrack = def.blocksTrack && (trackAt(world, c) || stationAt(world, c));
    if (objectAt(world, catalogs, c) || blockedByTrack) return fail(REASONS.occupied, label);
  }

  return {
    ok: true,
    state: {
      ...withWorld(state, {
        objects: [
          ...world.objects,
          {
            id: `obj-${state.nextObjectId}`,
            type: def.id,
            at: cell,
            locked: false,
            placedInSession: state.editorSession,
          },
        ],
      }),
      nextObjectId: state.nextObjectId + 1,
    },
    delta: 0,
    label,
  };
}

function erase(
  state: GameState,
  { catalogs, rules, economy }: RulesContext,
  cell: Cell,
): ActionOutcome {
  const { world } = state;
  const train = trainAt(state.trains, cell);
  if (train) return scrapTrain(state, catalogs, economy.refundRatio, train);
  const track = trackAt(world, cell);
  if (track) {
    const label = `Remove ${catalogs.pieces[track.piece]?.name ?? track.piece}`;
    if (track.locked) return fail(REASONS.locked, label);
    if (stationAt(world, cell)) return fail(REASONS.partOfStation, label);
    // Removing something placed in this editor session is a free undo; otherwise partial refund.
    const refund =
      track.placedInSession === state.editorSession
        ? track.paid
        : roundMoney(track.paid * economy.refundRatio);
    return {
      ok: true,
      state: {
        ...withWorld(state, { tracks: world.tracks.filter((t) => t !== track) }),
        ledger: record(state.ledger, 'refunds', refund),
      },
      delta: refund,
      label,
    };
  }

  const object = objectAt(world, catalogs, cell);
  if (!object) return fail(REASONS.nothingToErase, 'Erase');
  const def = catalogs.objects[object.type];
  const label = `Remove ${def?.name ?? object.type}`;
  if (!rules.allowObjectEdit) return fail(REASONS.noObjectEdit, label);
  if (object.locked) return fail(REASONS.locked, label);
  if (!def?.removable) return fail(REASONS.notRemovable, label);
  const cost = object.placedInSession === state.editorSession ? 0 : (def.removeCost ?? 0);
  if (!canAfford(state.initialMoney, state.ledger, cost)) return fail(REASONS.noMoney, label);
  return {
    ok: true,
    state: {
      ...withWorld(state, { objects: world.objects.filter((o) => o !== object) }),
      ledger: record(state.ledger, 'objects', cost),
    },
    delta: -cost,
    label,
  };
}

function rotateTrack(state: GameState, { catalogs }: RulesContext, cell: Cell): ActionOutcome {
  const { world } = state;
  const track = trackAt(world, cell);
  if (!track) return fail(REASONS.nothingToRotate, 'Rotate');
  const label = `Rotate ${catalogs.pieces[track.piece]?.name ?? track.piece}`;
  if (track.locked) return fail(REASONS.locked, label);
  if (stationAt(world, cell)) return fail(REASONS.partOfStation, label);
  if (trainAt(state.trains, cell)) return fail(REASONS.trainOccupied, label);
  const piece = catalogs.pieces[track.piece];
  const step = piece ? rotationStep(piece) : 90;
  const rotated: PlacedTrack = { ...track, rotation: (track.rotation + step) % 360 };
  return {
    ok: true,
    state: withWorld(state, {
      tracks: world.tracks.map((t) => (sameCell(t.at, cell) ? rotated : t)),
    }),
    delta: 0,
    label,
  };
}

function paintTerrain(
  state: GameState,
  { catalogs, rules }: RulesContext,
  { cells, terrain: terrainId }: Extract<EditorAction, { type: 'paintTerrain' }>,
): ActionOutcome {
  const { world } = state;
  const def = catalogs.terrains[terrainId];
  const label = def?.name ?? terrainId;
  if (!rules.allowTerrainEdit) return fail(REASONS.noTerrainEdit, label);
  if (!def) return fail(REASONS.notAllowed, label);

  let terrain: string[] | null = null;
  let firstReason: string = REASONS.noChange;
  for (const cell of cells) {
    if (!inBounds(world, cell)) {
      firstReason = REASONS.outside;
      continue;
    }
    if (terrainAt(world, cell) === terrainId) continue;
    if (!def.buildable && (trackAt(world, cell) || stationAt(world, cell))) {
      firstReason = REASONS.notBuildable;
      continue;
    }
    const object = objectAt(world, catalogs, cell);
    const objectDef = object && catalogs.objects[object.type];
    if (objectDef) {
      const allowed = objectDef.allowedTerrains
        ? objectDef.allowedTerrains.includes(terrainId)
        : def.buildable;
      if (!allowed) {
        firstReason = REASONS.terrainNotAllowed;
        continue;
      }
    }
    terrain ??= [...world.terrain];
    terrain[cellIndex(world, cell)] = terrainId;
  }
  if (!terrain) return fail(firstReason, label);
  return { ok: true, state: withWorld(state, { terrain }), delta: 0, label };
}

function placeTrain(
  state: GameState,
  { catalogs, rules, economy }: RulesContext,
  action: Extract<EditorAction, { type: 'placeTrain' }>,
): ActionOutcome {
  const loco = catalogs.locomotives[action.locomotive];
  const wagonDefs = action.wagons.map((id) => catalogs.wagons[id]);
  const count = action.wagons.length;
  const label = `${loco?.name ?? action.locomotive} train${count ? ` + ${count} wagon${count > 1 ? 's' : ''}` : ''}`;
  if (!loco || !isAllowed(rules.allowedLocomotives, loco.id))
    return fail(REASONS.notAllowed, label);
  if (wagonDefs.some((w) => !w || !isAllowed(rules.allowedWagons, w.id))) {
    return fail(REASONS.notAllowed, label);
  }
  if (count > loco.maxWagons) return fail(REASONS.tooManyWagons, label);
  if (rules.maxTrains !== null && state.trains.length >= rules.maxTrains) {
    return fail(REASONS.trainLimit, label);
  }

  const layout = layoutTrainFacing(state.world, catalogs.pieces, action.cell, action.facing, count);
  if (!layout.ok) return fail(layout.reason, label);
  const cells = [layout.head.cell, ...layout.trail.map((p) => p.cell)];
  if (cells.some((c) => trainAt(state.trains, c))) return fail(REASONS.trainOccupied, label);

  const vehicles = roundMoney(loco.cost + wagonDefs.reduce((sum, w) => sum + (w?.cost ?? 0), 0));
  const fuelCost = roundMoney(loco.fuelCapacity * economy.fuelPrice);
  const total = roundMoney(vehicles + fuelCost);
  if (!canAfford(state.initialMoney, state.ledger, total)) return fail(REASONS.noMoney, label);

  const train: TrainState = {
    id: `t${state.nextTrainId}`,
    locomotive: loco.id,
    wagons: action.wagons.map((model) => ({ model, cargo: null, amount: 0 })),
    head: layout.head,
    trail: layout.trail,
    // Vehicles start centered in their cells.
    progress: 0.5 * routeLength(layout.head.entry, layout.head.exit),
    speed: 0,
    running: false,
    status: 'stopped',
    fuel: loco.fuelCapacity,
    autoRefuel: true,
    dwellRemaining: 0,
    lastStation: null,
    purchaseValue: vehicles,
    paid: total,
    placedInSession: state.editorSession,
  };
  return {
    ok: true,
    state: {
      ...state,
      trains: [...state.trains, train],
      nextTrainId: state.nextTrainId + 1,
      ledger: record(record(state.ledger, 'trains', vehicles), 'fuel', fuelCost),
    },
    delta: -total,
    label,
  };
}

/** Scrapping refunds everything in the session it was bought, else part of the vehicles' value. */
export function scrapRefund(state: GameState, refundRatio: number, train: TrainState): number {
  return train.placedInSession === state.editorSession
    ? train.paid
    : roundMoney(train.purchaseValue * refundRatio);
}

function scrapTrain(
  state: GameState,
  catalogs: RulesContext['catalogs'],
  refundRatio: number,
  train: TrainState,
): ActionOutcome {
  const label = `Scrap ${catalogs.locomotives[train.locomotive]?.name ?? train.locomotive} train`;
  const refund = scrapRefund(state, refundRatio, train);
  return {
    ok: true,
    state: {
      ...state,
      trains: state.trains.filter((t) => t !== train),
      ledger: record(state.ledger, 'refunds', refund),
    },
    delta: refund,
    label,
  };
}
