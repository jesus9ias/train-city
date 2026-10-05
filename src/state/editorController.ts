import { applyAction, type ActionOutcome, type EditorAction } from '../core/editor/actions';
import {
  isLinePiece,
  nextHeading,
  pieceForRoute,
  type GridPoint,
  type PieceFit,
} from '../core/editor/drawLine';
import { RUN_REASONS } from '../core/sim/commands';
import type { Cell } from '../core/grid/coords';
import { neighbor, oppositePort, type Port } from '../core/grid/ports';
import { facingFromRotation, trainAt } from '../core/sim/placement';
import { snapRotation } from '../core/track/rotation';
import { cellKey, inBounds, trackAt } from '../core/world/world';
import type { Catalogs } from '../data/schemas/catalogs';
import type { Tool } from './editorStore';
import type { ReadySession } from './gameStore';
import type { AppStores } from './stores';

/**
 * The editor action a tool performs on a cell (null for tools that do not edit). With the
 * catalogs, a track's rotation snaps to one the piece can take (spec.md §4.4).
 */
export function toolAction(
  tool: Tool | null,
  rotation: number,
  cell: Cell,
  catalogs?: Catalogs,
): EditorAction | null {
  switch (tool?.kind) {
    case 'track': {
      const piece = catalogs?.pieces[tool.piece];
      return {
        type: 'placeTrack',
        cell,
        piece: tool.piece,
        rotation: piece ? snapRotation(piece, rotation) : rotation,
      };
    }
    case 'object':
      return { type: 'placeObject', cell, object: tool.object };
    case 'terrain':
      return { type: 'paintTerrain', cells: [cell], terrain: tool.terrain };
    case 'erase':
      return { type: 'erase', cell };
    case 'rotate':
      return { type: 'rotateTrack', cell };
    case 'train':
      return {
        type: 'placeTrain',
        cell,
        locomotive: tool.locomotive,
        wagons: tool.wagons,
        facing: facingFromRotation(rotation),
      };
    default:
      return null;
  }
}

/** Tools that keep acting while the pointer is dragged (one undo step per stroke). */
export function isDragTool(tool: Tool | null): boolean {
  return tool?.kind === 'terrain' || tool?.kind === 'erase';
}

/** Tools that draw a line of track when dragged (spec.md §6.1): the Straight. */
export function isLineTool(tool: Tool | null, catalogs: Catalogs): boolean {
  const piece = tool?.kind === 'track' ? catalogs.pieces[tool.piece] : undefined;
  return piece !== undefined && isLinePiece(piece);
}

/** A line being drawn: its head cell, the heading it entered with, the cells it placed. */
type Line = {
  head: Cell;
  heading: Port | null;
  readonly placed: Set<string>;
  moved: boolean;
  readonly downFailure: string | null;
  lastPoint: GridPoint | null;
};

/** Safety cap on steps per pointer event (a fast drag may cover many cells at once). */
const MAX_STEPS_PER_MOVE = 64;

/** What would happen if the current tool were used on `cell` (ghost preview, tooltip). */
export function previewAt(
  session: ReadySession,
  tool: Tool | null,
  rotation: number,
  cell: Cell,
): ActionOutcome | null {
  const action = toolAction(tool, rotation, cell, session.ctx.catalogs);
  return action ? applyAction(session.game, session.ctx, action) : null;
}

/**
 * Pointer handling for the editor, shared by any input source. `down` starts a stroke and
 * reports failures; `drag` continues drag tools silently; `up` closes the stroke.
 */
export function createEditorController({ game, editor }: AppStores) {
  let lastCell: Cell | null = null;
  let line: Line | null = null;

  const applyTool = (cell: Cell, reportFailure: boolean) => {
    const { session } = game.getState();
    if (session.status !== 'ready') return;
    if (session.game.mode === 'running') {
      if (reportFailure) runClick(cell);
      return;
    }
    const { tool, rotation } = editor.getState();
    if (tool?.kind === 'inspect') {
      editor.getState().inspect(cell);
      editor.getState().selectTrain(trainAt(session.game.trains, cell)?.id ?? null);
      return;
    }
    const action = toolAction(tool, rotation, cell, session.ctx.catalogs);
    if (!action) return;
    const outcome = game.getState().execute(action);
    if (!outcome.ok && reportFailure) editor.getState().notify(outcome.reason);
  };

  /** Run Mode clicks: select a train, or flip a switch. */
  const runClick = (cell: Cell) => {
    const { session } = game.getState();
    if (session.status !== 'ready') return;
    const train = trainAt(session.game.trains, cell);
    if (train) {
      editor.getState().selectTrain(train.id);
      return;
    }
    const outcome = game.getState().flipSwitch(cell);
    if (!outcome.ok && outcome.reason !== RUN_REASONS.notASwitch) {
      editor.getState().notify(outcome.reason);
    }
    if (!outcome.ok) editor.getState().selectTrain(null);
  };

  const place = (cell: Cell, fit: PieceFit) =>
    game.getState().execute({ type: 'placeTrack', cell, ...fit }).ok;

  /** Turns a cell this stroke placed into `fit` (erase + place: free in the same session). */
  const reshape = (cell: Cell, fit: PieceFit) => {
    const { session } = game.getState();
    if (session.status !== 'ready') return;
    const track = trackAt(session.game.world, cell);
    if (track?.piece === fit.piece && track.rotation === fit.rotation) return;
    if (game.getState().execute({ type: 'erase', cell }).ok) place(cell, fit);
  };

  /** Moves the line's head towards the pointer, one cell in one of 8 headings per step. */
  const extendLine = (current: Line, point: GridPoint, final = false) => {
    const { session } = game.getState();
    if (session.status !== 'ready') return;
    const { catalogs, rules } = session.ctx;
    const fitFor = (a: Port, b: Port) => pieceForRoute(catalogs.pieces, rules.allowedPieces, a, b);
    current.lastPoint = point;
    for (let i = 0; i < MAX_STEPS_PER_MOVE; i++) {
      const heading = nextHeading(current.head, current.heading, point, final);
      if (!heading) return;
      const shape = fitFor(oppositePort(current.heading ?? heading), heading);
      if (!shape) return; // a turn the catalog or the level cannot draw: wait
      const next = neighbor(current.head, heading);
      if (!inBounds(session.game.world, next)) return;
      if (current.placed.has(cellKey(current.head))) reshape(current.head, shape);
      const straight = fitFor(oppositePort(heading), heading);
      if (straight && place(next, straight)) current.placed.add(cellKey(next));
      current.head = next;
      current.heading = heading;
      current.moved = true;
    }
  };

  return {
    down(cell: Cell) {
      lastCell = cell;
      game.getState().beginStroke();
      const { session } = game.getState();
      const { tool } = editor.getState();
      if (
        session.status === 'ready' &&
        session.game.mode === 'editing' &&
        isLineTool(tool, session.ctx.catalogs)
      ) {
        // Report a failed click only if the pointer is released without drawing.
        const action = toolAction(tool, editor.getState().rotation, cell, session.ctx.catalogs);
        const outcome = action ? game.getState().execute(action) : null;
        line = {
          head: cell,
          heading: null,
          placed: new Set(outcome?.ok ? [cellKey(cell)] : []),
          moved: false,
          downFailure: outcome && !outcome.ok ? outcome.reason : null,
          lastPoint: null,
        };
        return;
      }
      applyTool(cell, true);
    },
    /** `point` (cell units) steers drawn lines; other drag tools only need the cell. */
    drag(cell: Cell, point?: GridPoint) {
      if (line) {
        extendLine(line, point ?? { x: cell.x + 0.5, y: cell.y + 0.5 });
        return;
      }
      if (!lastCell || (lastCell.x === cell.x && lastCell.y === cell.y)) return;
      lastCell = cell;
      if (isDragTool(editor.getState().tool)) applyTool(cell, false);
    },
    up() {
      // The head trails the pointer by up to a cell: finish the line where it was released.
      if (line?.lastPoint) extendLine(line, line.lastPoint, true);
      if (line && !line.moved && line.downFailure) editor.getState().notify(line.downFailure);
      line = null;
      lastCell = null;
      game.getState().endStroke();
    },
    /** True while a line is being drawn (the ghost preview hides meanwhile). */
    get drawing() {
      return line?.moved ?? false;
    },
  };
}

export type EditorController = ReturnType<typeof createEditorController>;
