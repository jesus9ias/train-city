import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import type { Level } from '../data/schemas/level';
import type { ReadySession } from '../state/gameStore';
import { createAppStores, type AppStores } from '../state/stores';
import { makeLevel, testCatalogs } from '../test/fixtures';
import { CursorTooltip } from './CursorTooltip';
import { formatDelta, formatMoney } from './format';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { Toast } from './Toast';
import { useShortcuts } from './useShortcuts';

async function storesWith(level: Level): Promise<AppStores> {
  const stores = createAppStores({
    catalogs: testCatalogs,
    levels: [],
    loadLevel: () => Promise.resolve(level),
  });
  await stores.game.getState().loadLevel(level.id);
  return stores;
}

function ready(stores: AppStores): ReadySession {
  const { session } = stores.game.getState();
  if (session.status !== 'ready') throw new Error('not ready');
  return session;
}

/** Renders a component that needs the current ready session, re-rendering on store changes. */
function Live({
  stores,
  children,
}: {
  stores: AppStores;
  children: (s: ReadySession) => React.ReactNode;
}) {
  return <>{children(ready(stores))}</>;
}

describe('Palette', () => {
  it('lists allowed pieces with prices and selects a tool', async () => {
    const stores = await storesWith(
      makeLevel(
        {},
        {
          editorRules: {
            allowTerrainEdit: false,
            allowObjectEdit: true,
            maxTrains: 1,
            allowedPieces: ['straight', 'curve'],
          },
        },
      ),
    );
    render(<Palette stores={stores} session={ready(stores)} />);
    const items = within(screen.getByRole('tabpanel'));
    expect(items.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Straight$10',
      'Curve$12',
    ]);
    // Scenario: Terrain locked by the level
    expect(screen.queryByRole('tab', { name: 'Terrain' })).not.toBeInTheDocument();

    await userEvent.click(items.getByRole('button', { name: /Straight/ }));
    expect(stores.editor.getState().tool).toEqual({ kind: 'track', piece: 'straight' });
    await userEvent.click(items.getByRole('button', { name: /Straight/ }));
    expect(stores.editor.getState().tool).toBeNull();
  });

  it('switches tabs and selects tools', async () => {
    const stores = await storesWith(makeLevel());
    render(<Palette stores={stores} session={ready(stores)} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Terrain' }));
    await userEvent.click(screen.getByRole('button', { name: /Snow/ }));
    expect(stores.editor.getState().tool).toEqual({ kind: 'terrain', terrain: 'snow' });
    await userEvent.click(screen.getByRole('tab', { name: 'Objects' }));
    await userEvent.click(screen.getByRole('button', { name: /Rock/ }));
    expect(stores.editor.getState().tool).toEqual({ kind: 'object', object: 'rock' });
    await userEvent.click(screen.getByRole('button', { name: 'Erase' }));
    expect(stores.editor.getState().tool).toEqual({ kind: 'erase' });
  });

  it('undo and redo buttons follow the history', async () => {
    const stores = await storesWith(makeLevel());
    const { rerender } = render(<Palette stores={stores} session={ready(stores)} />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    act(() => {
      stores.game
        .getState()
        .execute({ type: 'placeTrack', cell: { x: 1, y: 1 }, piece: 'straight', rotation: 0 });
    });
    rerender(<Palette stores={stores} session={ready(stores)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    rerender(<Palette stores={stores} session={ready(stores)} />);
    expect(ready(stores).game.world.tracks).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(ready(stores).game.world.tracks).toHaveLength(1);
  });
});

describe('CursorTooltip', () => {
  it('shows cost, or the reason with a ✕', async () => {
    const stores = await storesWith(makeLevel({ objects: [{ type: 'rock', at: { x: 4, y: 4 } }] }));
    stores.editor.getState().selectTool({ kind: 'track', piece: 'straight' });
    stores.view.getState().setHoverCell({ x: 1, y: 1 });
    const { rerender } = render(
      <CursorTooltip stores={stores} session={ready(stores)} position={{ x: 0, y: 0 }} />,
    );
    expect(screen.getByTestId('cursor-tooltip')).toHaveTextContent('Straight · −$10');

    act(() => {
      stores.view.getState().setHoverCell({ x: 4, y: 4 });
    });
    rerender(<CursorTooltip stores={stores} session={ready(stores)} position={{ x: 0, y: 0 }} />);
    expect(screen.getByTestId('cursor-tooltip')).toHaveTextContent('Straight · ✕ Cell occupied');

    rerender(<CursorTooltip stores={stores} session={ready(stores)} position={null} />);
    expect(screen.queryByTestId('cursor-tooltip')).not.toBeInTheDocument();
  });
});

describe('Inspector', () => {
  it('describes the inspected cell and runs the network check', async () => {
    const stores = await storesWith(
      makeLevel({
        objects: [{ type: 'house_s', at: { x: 5, y: 5 }, locked: true }],
        tracks: [{ at: { x: 1, y: 1 }, piece: 'straight', rotation: 0 }],
      }),
    );
    stores.editor.getState().inspect({ x: 1, y: 1 });
    render(<Live stores={stores}>{(s) => <Inspector stores={stores} session={s} />}</Live>);
    expect(screen.getByTestId('inspector-cell')).toHaveTextContent('Grass');
    expect(screen.getByTestId('inspector-cell')).toHaveTextContent('Straight · 0°');

    await userEvent.click(screen.getByRole('button', { name: 'Check network' }));
    expect(screen.getByTestId('network-report')).toHaveTextContent('Loose ends: 2');
  });
});

describe('Toast', () => {
  it('shows the latest notice', () => {
    const stores = createAppStores({
      catalogs: testCatalogs,
      levels: [],
      loadLevel: () => Promise.reject(new Error('x')),
    });
    render(<Toast editor={stores.editor} />);
    act(() => {
      stores.editor.getState().notify('Not enough money');
    });
    expect(screen.getByTestId('toast')).toHaveTextContent('✕ Not enough money');
  });
});

describe('shortcuts', () => {
  function Harness({ stores }: { stores: AppStores }) {
    useShortcuts(stores);
    return <input aria-label="typing" />;
  }

  it('maps keys to editor commands', async () => {
    const stores = await storesWith(makeLevel());
    render(<Harness stores={stores} />);
    // R turns by the selected piece's step (spec.md §4.4): 45° for a straight, 90° for a curve.
    await userEvent.keyboard('r');
    expect(stores.editor.getState().rotation).toBe(45);
    stores.editor.getState().selectTool({ kind: 'track', piece: 'curve' });
    await userEvent.keyboard('r');
    expect(stores.editor.getState().rotation).toBe(90);
    stores.editor.getState().selectTool({ kind: 'track', piece: 'straight' });
    await userEvent.keyboard('r');
    expect(stores.editor.getState().rotation).toBe(135);
    await userEvent.keyboard('{Delete}');
    expect(stores.editor.getState().tool).toEqual({ kind: 'erase' });
    await userEvent.keyboard('i');
    expect(stores.editor.getState().tool).toEqual({ kind: 'inspect' });
    await userEvent.keyboard('{Escape}');
    expect(stores.editor.getState().tool).toBeNull();
    await userEvent.keyboard('g');
    expect(stores.view.getState().showGrid).toBe(false);

    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: { x: 1, y: 1 }, piece: 'straight', rotation: 0 });
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(ready(stores).game.world.tracks).toHaveLength(0);
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(ready(stores).game.world.tracks).toHaveLength(1);
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(ready(stores).game.world.tracks).toHaveLength(1);

    // Typing in a form field never triggers shortcuts.
    await userEvent.type(screen.getByLabelText('typing'), 'r');
    expect(stores.editor.getState().rotation).toBe(135);
  });
});

describe('format', () => {
  it('formats money and deltas', () => {
    expect(formatMoney(2500)).toBe('$2,500');
    expect(formatMoney(null)).toBe('∞');
    expect(formatDelta(-10)).toBe('−$10');
    expect(formatDelta(5.5)).toBe('+$5.5');
    expect(formatDelta(0)).toBe('Free');
  });
});
