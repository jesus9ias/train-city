import { useStore } from 'zustand';
import { buildCost } from '../core/economy/ledger';
import { moneyOf } from '../core/game/state';
import type { AppStores } from '../state/stores';
import { formatMoney } from './format';

type Props = { stores: Pick<AppStores, 'view' | 'game'> };

export function StatusBar({ stores }: Props) {
  const { view, game } = stores;
  const zoom = useStore(view, (s) => s.zoom);
  const showGrid = useStore(view, (s) => s.showGrid);
  const hoverCell = useStore(view, (s) => s.hoverCell);
  const session = useStore(game, (s) => s.session);
  const { zoomIn, zoomOut, toggleGrid } = view.getState();

  return (
    <footer className="status-bar">
      {session.status === 'ready' && (
        <>
          <span data-testid="money" title="Money">
            {formatMoney(moneyOf(session.game))}
          </span>
          <span data-testid="build-cost" title="Net money spent on construction">
            Build {formatMoney(buildCost(session.game.ledger))}
          </span>
        </>
      )}
      <span data-testid="hover-cell">
        Cell: {hoverCell ? `${hoverCell.x}, ${hoverCell.y}` : '—'}
      </span>
      <span className="status-bar__spacer" />
      <label className="status-bar__toggle">
        <input type="checkbox" checked={showGrid} onChange={toggleGrid} />
        Grid (G)
      </label>
      <button type="button" onClick={zoomOut} aria-label="Zoom out">
        −
      </button>
      <span data-testid="zoom-level" aria-live="polite">
        Zoom {zoom}×
      </span>
      <button type="button" onClick={zoomIn} aria-label="Zoom in">
        +
      </button>
    </footer>
  );
}
