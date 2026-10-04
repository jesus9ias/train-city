import { useStore } from 'zustand';
import { previewAt } from '../state/editorController';
import type { ReadySession } from '../state/gameStore';
import type { AppStores } from '../state/stores';
import { formatDelta } from './format';

type Props = {
  stores: AppStores;
  session: ReadySession;
  /** Pointer position relative to the game area, or null when outside. */
  position: { x: number; y: number } | null;
};

/** Explains the ghost preview next to the cursor: what happens, its cost, or why it can't. */
export function CursorTooltip({ stores, session, position }: Props) {
  const tool = useStore(stores.editor, (s) => s.tool);
  const rotation = useStore(stores.editor, (s) => s.rotation);
  const hoverCell = useStore(stores.view, (s) => s.hoverCell);
  if (!position || !hoverCell || !tool || tool.kind === 'inspect') return null;
  const preview = previewAt(session, tool, rotation, hoverCell);
  if (!preview) return null;

  return (
    <div
      className={`cursor-tooltip ${preview.ok ? 'cursor-tooltip--ok' : 'cursor-tooltip--error'}`}
      style={{ left: position.x + 16, top: position.y + 16 }}
      role="status"
      data-testid="cursor-tooltip"
    >
      <strong>{preview.label}</strong>
      {preview.ok ? (
        <span> · {formatDelta(preview.delta)}</span>
      ) : (
        <span>
          {' '}
          · <span aria-hidden="true">✕</span> {preview.reason}
        </span>
      )}
    </div>
  );
}
