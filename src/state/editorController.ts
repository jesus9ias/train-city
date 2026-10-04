import { applyAction, type ActionOutcome, type EditorAction } from '../core/editor/actions';
import { RUN_REASONS } from '../core/sim/commands';
import type { Cell } from '../core/grid/coords';
import { facingFromRotation, trainAt } from '../core/sim/placement';
import type { Tool } from './editorStore';
import type { ReadySession } from './gameStore';
import type { AppStores } from './stores';

/** The editor action a tool performs on a cell (null for tools that do not edit). */
export function toolAction(tool: Tool | null, rotation: number, cell: Cell): EditorAction | null {
  switch (tool?.kind) {
    case 'track':
      return { type: 'placeTrack', cell, piece: tool.piece, rotation };
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

/** What would happen if the current tool were used on `cell` (ghost preview, tooltip). */
export function previewAt(
  session: ReadySession,
  tool: Tool | null,
  rotation: number,
  cell: Cell,
): ActionOutcome | null {
  const action = toolAction(tool, rotation, cell);
  return action ? applyAction(session.game, session.ctx, action) : null;
}

/**
 * Pointer handling for the editor, shared by any input source. `down` starts a stroke and
 * reports failures; `drag` continues drag tools silently; `up` closes the stroke.
 */
export function createEditorController({ game, editor }: AppStores) {
  let lastCell: Cell | null = null;

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
    const action = toolAction(tool, rotation, cell);
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

  return {
    down(cell: Cell) {
      lastCell = cell;
      game.getState().beginStroke();
      applyTool(cell, true);
    },
    drag(cell: Cell) {
      if (!lastCell || (lastCell.x === cell.x && lastCell.y === cell.y)) return;
      lastCell = cell;
      if (isDragTool(editor.getState().tool)) applyTool(cell, false);
    },
    up() {
      lastCell = null;
      game.getState().endStroke();
    },
  };
}

export type EditorController = ReturnType<typeof createEditorController>;
