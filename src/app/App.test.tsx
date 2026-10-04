import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAppStores } from '../state/stores';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

// Phaser needs a real canvas; rendering is covered by the E2E tests.
vi.mock('../render/GameCanvas', () => ({
  GameCanvas: () => <div data-testid="game-canvas" />,
}));

describe('App', () => {
  it('loads the initial level and renders the shell around the canvas', async () => {
    render(<App stores={createAppStores()} initialLevelId="level-001" />);
    expect(screen.getByRole('heading', { name: 'Train City' })).toBeInTheDocument();
    expect(await screen.findByTestId('game-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('level-description')).toHaveTextContent('Haul 50 t of coal');
    expect(screen.getByRole('combobox', { name: 'Level' })).toHaveValue('level-001');
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('Zoom 1×');
  });

  it('switches levels from the picker', async () => {
    const onLevelChange = vi.fn();
    const stores = createAppStores();
    render(<App stores={stores} initialLevelId="level-001" onLevelChange={onLevelChange} />);
    await screen.findByTestId('game-canvas');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Level' }), 'sandbox');
    expect(onLevelChange).toHaveBeenCalledWith('sandbox');
    await waitFor(() => {
      expect(screen.getByTestId('level-description')).toHaveTextContent('Build freely');
    });
  });

  it('shows a readable error for an unknown level', async () => {
    render(<App stores={createAppStores()} initialLevelId="nope" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load level "nope"');
    expect(screen.getByRole('alert')).toHaveTextContent('unknown level "nope"');
    expect(screen.queryByTestId('game-canvas')).not.toBeInTheDocument();
  });
});

describe('ErrorBoundary', () => {
  it('shows a recovery screen instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('kaboom');
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('kaboom');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
