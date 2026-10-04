import { useStore } from 'zustand';
import type { Tool } from '../state/editorStore';
import type { ReadySession } from '../state/gameStore';
import type { AppStores } from '../state/stores';

type Props = { stores: AppStores; session: ReadySession };

function toolName(tool: Tool, session: ReadySession): string {
  const { catalogs } = session.ctx;
  switch (tool.kind) {
    case 'track':
      return catalogs.pieces[tool.piece]?.name ?? tool.piece;
    case 'object':
      return catalogs.objects[tool.object]?.name ?? tool.object;
    case 'terrain':
      return catalogs.terrains[tool.terrain]?.name ?? tool.terrain;
    case 'train':
      return `${catalogs.locomotives[tool.locomotive]?.name ?? 'Train'} train`;
    case 'erase':
      return 'Erase';
    case 'rotate':
      return 'Rotate';
    case 'inspect':
      return 'Inspect';
  }
}

/**
 * Buttons over the map for actions that otherwise need a keyboard (spec.md §13.1): the active
 * tool, ↻ (same as R) and ✕ (same as Esc).
 */
export function MapControls({ stores, session }: Props) {
  const tool = useStore(stores.editor, (s) => s.tool);
  const rotation = useStore(stores.editor, (s) => s.rotation);
  if (session.game.mode !== 'editing' || !tool) return null;
  const { rotate, selectTool } = stores.editor.getState();
  const rotates = tool.kind === 'track' || tool.kind === 'train';
  return (
    <div className="map-controls" role="toolbar" aria-label="Active tool">
      <span className="map-controls__tool" data-testid="active-tool">
        {toolName(tool, session)}
        {tool.kind === 'track' && ` · ${rotation}°`}
      </span>
      {rotates && (
        <button
          type="button"
          className="tool-button"
          aria-label={tool.kind === 'train' ? 'Turn the train around' : 'Rotate piece'}
          onClick={rotate}
        >
          ↻
        </button>
      )}
      <button
        type="button"
        className="tool-button"
        aria-label="Deselect tool"
        onClick={() => {
          selectTool(null);
        }}
      >
        ✕
      </button>
    </div>
  );
}
