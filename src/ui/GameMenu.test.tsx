import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GameFileActions } from '../persistence';
import { createSaveStatusStore } from '../state/saveStatusStore';
import { GameMenu } from './GameMenu';

function setup(overrides: Partial<GameFileActions> = {}) {
  const actions: GameFileActions = {
    exportGame: vi.fn(),
    importFile: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    restart: vi.fn(),
    ...overrides,
  };
  const saveStatus = createSaveStatusStore();
  render(<GameMenu actions={actions} saveStatus={saveStatus} />);
  return { actions, saveStatus };
}

describe('GameMenu', () => {
  it('downloads the game', async () => {
    const { actions } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Download game' }));
    expect(actions.exportGame).toHaveBeenCalled();
  });

  it('imports a picked file', async () => {
    const { actions } = setup();
    const file = new File(['{}'], 'save.json', { type: 'application/json' });
    await userEvent.upload(screen.getByTestId('import-input'), file);
    expect(actions.importFile).toHaveBeenCalledWith(file);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows readable errors when an import fails', async () => {
    setup({
      importFile: () =>
        Promise.resolve({
          ok: false,
          issues: [{ path: 'economy.initialMoney', message: 'Expected number' }],
        }),
    });
    await userEvent.upload(
      screen.getByTestId('import-input'),
      new File(['{}'], 'bad.json', { type: 'application/json' }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Could not import this file' });
    expect(dialog).toHaveTextContent('Your current game was not changed.');
    expect(screen.getByTestId('import-issues')).toHaveTextContent(
      'economy.initialMoney Expected number',
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation before restarting', async () => {
    const { actions } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Restart level' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(actions.restart).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Restart level' }));
    expect(screen.getByRole('dialog', { name: 'Restart level?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(actions.restart).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the save status', () => {
    const { saveStatus } = setup();
    const indicator = screen.getByTestId('save-status');
    expect(indicator).toHaveTextContent('');
    act(() => {
      saveStatus.getState().setStatus({ kind: 'pending' });
    });
    expect(indicator).toHaveTextContent('Saving…');
    act(() => {
      saveStatus.getState().setStatus({ kind: 'saved', at: new Date(2026, 9, 3, 18, 5) });
    });
    expect(indicator).toHaveTextContent(/Saved ✓ 06:05\s?PM/);
    act(() => {
      saveStatus.getState().setStatus({ kind: 'error', message: 'Storage is full' });
    });
    expect(indicator).toHaveTextContent('✕ Not saved: Storage is full');
  });
});
