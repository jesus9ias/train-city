import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { createAppStores } from '../state/stores';
import { makeLevel, testCatalogs } from '../test/fixtures';
import { StatusBar } from './StatusBar';

const stores = () =>
  createAppStores({
    catalogs: testCatalogs,
    levels: [],
    loadLevel: () =>
      Promise.resolve(makeLevel({}, { economy: { initialMoney: 2500, fuelPrice: 1 } })),
  });

describe('StatusBar', () => {
  it('shows and changes the zoom level', async () => {
    const s = stores();
    render(<StatusBar stores={s} />);
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('Zoom 1×');

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('Zoom 2×');
    expect(s.view.getState().zoom).toBe(2);
  });

  it('toggles the grid', async () => {
    const s = stores();
    render(<StatusBar stores={s} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /grid/i }));
    expect(s.view.getState().showGrid).toBe(false);
  });

  it('shows the hovered cell', () => {
    const s = stores();
    render(<StatusBar stores={s} />);
    expect(screen.getByTestId('hover-cell')).toHaveTextContent('Cell: —');
    act(() => {
      s.view.getState().setHoverCell({ x: 3, y: 7 });
    });
    expect(screen.getByTestId('hover-cell')).toHaveTextContent('Cell: 3, 7');
  });

  it('shows money and build cost once a level is loaded', async () => {
    const s = stores();
    render(<StatusBar stores={s} />);
    expect(screen.queryByTestId('money')).not.toBeInTheDocument();
    await act(() => s.game.getState().loadLevel('test'));
    expect(screen.getByTestId('money')).toHaveTextContent('$2,500');
    act(() => {
      s.game
        .getState()
        .execute({ type: 'placeTrack', cell: { x: 1, y: 1 }, piece: 'straight', rotation: 0 });
    });
    expect(screen.getByTestId('money')).toHaveTextContent('$2,490');
    expect(screen.getByTestId('build-cost')).toHaveTextContent('Build $10');
  });
});
