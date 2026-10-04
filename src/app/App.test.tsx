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

describe('App — compact layout (spec.md §13.1)', () => {
  function phoneViewport(matches = true) {
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches,
        media: query,
        addEventListener: (_: string, l: () => void) => listeners.add(l),
        removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      })),
    );
  }

  it('keeps panels in drawers and hands the map back when a tool is picked', async () => {
    phoneViewport();
    const stores = createAppStores();
    render(<App stores={stores} initialLevelId="level-001" />);
    await screen.findByTestId('game-canvas');
    expect(screen.getByTestId('drawer-tools')).not.toBeVisible();
    expect(screen.getByTestId('drawer-info')).not.toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Build' }));
    expect(screen.getByTestId('drawer-tools')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Build' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Curve/ }));
    expect(screen.getByTestId('drawer-tools')).not.toBeVisible();

    // On-map controls replace the keyboard shortcuts.
    expect(screen.getByTestId('active-tool')).toHaveTextContent('Curve · 0°');
    expect(screen.getByRole('toolbar', { name: 'Active tool' })).toHaveTextContent(
      '90° turn between two straight lines.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Rotate piece' }));
    expect(stores.editor.getState().rotation).toBe(90);
    await userEvent.click(screen.getByRole('button', { name: 'Deselect tool' }));
    expect(stores.editor.getState().tool).toBeNull();
    expect(screen.queryByTestId('active-tool')).not.toBeInTheDocument();

    // One drawer at a time; the backdrop closes it.
    await userEvent.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByTestId('drawer-info')).toBeVisible();
    const backdrop = document.querySelector('.drawer-backdrop');
    if (!(backdrop instanceof HTMLElement)) throw new Error('no backdrop');
    await userEvent.click(backdrop);
    expect(screen.getByTestId('drawer-info')).not.toBeVisible();
    vi.unstubAllGlobals();
  });

  it('shows the full desktop layout on wide screens', async () => {
    phoneViewport(false);
    render(<App stores={createAppStores()} initialLevelId="level-001" />);
    await screen.findByTestId('game-canvas');
    expect(screen.queryByTestId('drawer-tools')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Build' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
    vi.unstubAllGlobals();
  });
});
