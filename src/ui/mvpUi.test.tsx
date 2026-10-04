import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Outcome } from '../core/game/state';
import { loadLevel, loadLevelIndex } from '../data/loader';
import type { ReadySession } from '../state/gameStore';
import { createAppStores, type AppStores } from '../state/stores';
import { testCatalogs } from '../test/fixtures';
import { formatMoney } from './format';
import { Inspector } from './Inspector';
import { LevelPicker } from './LevelPicker';
import { ObjectivesPanel } from './ObjectivesPanel';
import { ResultDialog } from './ResultDialog';
import { TrainPanel } from './TrainPanel';

async function level001(): Promise<AppStores> {
  const stores = createAppStores({ catalogs: testCatalogs, levels: [], loadLevel });
  await stores.game.getState().loadLevel('level-001');
  return stores;
}

function ready(stores: AppStores): ReadySession {
  const { session } = stores.game.getState();
  if (session.status !== 'ready') throw new Error('not ready');
  return session;
}

describe('ObjectivesPanel', () => {
  it('shows each objective with its progress, the time and the projected stars', async () => {
    const stores = await level001();
    const session = ready(stores);
    const delivered = {
      ...session,
      game: {
        ...session.game,
        elapsedTicks: 20 * 156,
        run: { ...session.game.run, delivered: { st_B: { coal: 30 } } },
      },
    };
    render(<ObjectivesPanel session={delivered} />);
    expect(screen.getByTestId('objectives')).toHaveTextContent('Deliver 50 t coal to Power Plant');
    expect(screen.getByTestId('objective-o1')).toHaveTextContent('30/50');
    expect(screen.getByTestId('time-left')).toHaveTextContent('02:36 / 10:00');
    expect(screen.getByTestId('projected-stars')).toHaveTextContent('★★★');
  });

  it('is hidden in levels without objectives', async () => {
    const stores = createAppStores({ catalogs: testCatalogs, levels: [], loadLevel });
    await stores.game.getState().loadLevel('sandbox');
    const { container } = render(<ObjectivesPanel session={ready(stores)} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Inspector station details', () => {
  it('shows supplies, demands and services of the inspected station', async () => {
    const stores = await level001();
    stores.editor.getState().inspect({ x: 10, y: 9 });
    render(<Inspector stores={stores} session={ready(stores)} />);
    expect(screen.getByTestId('supply-coal')).toHaveTextContent('50/100 coal (+10/min)');
    expect(screen.getByTestId('inspector-cell')).toHaveTextContent('Fuel');

    stores.editor.getState().inspect({ x: 41, y: 38 });
    render(<Inspector stores={stores} session={ready(stores)} />);
    expect(screen.getAllByTestId('inspector-cell')[1]).toHaveTextContent('Coal · delivered 0');
  });
});

describe('TrainPanel cargo', () => {
  it('lists every wagon and what it carries', async () => {
    const stores = await level001();
    const session = ready(stores);
    const train = {
      id: 't1',
      locomotive: 'loco_steam',
      wagons: [
        { model: 'wagon_hopper', cargo: 'coal', amount: 30 },
        { model: 'wagon_hopper', cargo: null, amount: 0 },
      ],
      status: 'loading',
      speed: 0,
      fuel: 480,
      running: true,
    } as unknown as ReadySession['game']['trains'][number];
    render(<TrainPanel stores={stores} session={session} train={train} />);
    expect(screen.getByTestId('wagon-list')).toHaveTextContent('Hopper: 30/30 t coal');
    expect(screen.getByTestId('wagon-list')).toHaveTextContent('Hopper: empty');
    expect(screen.getByTestId('train-status')).toHaveTextContent('Loading');
  });
});

describe('ResultDialog', () => {
  const completed: Outcome = {
    kind: 'completed',
    stars: 2,
    score: 218,
    seconds: 95.5,
    fuelUsed: 138.4,
    buildCost: 1032,
  };

  it('celebrates a completed level and offers the next one', async () => {
    const onRestart = vi.fn();
    const onNextLevel = vi.fn();
    const { rerender } = render(
      <ResultDialog
        loadId={1}
        outcome={completed}
        onRestart={onRestart}
        onNextLevel={onNextLevel}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Level complete!' })).toBeInTheDocument();
    expect(screen.getByTestId('result-stars')).toHaveTextContent('★★☆');
    expect(screen.getByTestId('result-score')).toHaveTextContent('$218');
    await userEvent.click(screen.getByRole('button', { name: 'Next level' }));
    expect(onNextLevel).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Restart level' }));
    expect(onRestart).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // A new load (restart) shows the next result again.
    rerender(<ResultDialog loadId={2} outcome={completed} onRestart={onRestart} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next level' })).not.toBeInTheDocument();
  });

  it('Scenario: Only option after failing is to restart', async () => {
    const onRestart = vi.fn();
    render(
      <ResultDialog
        loadId={1}
        outcome={{ kind: 'failed', reason: 'Time is up' }}
        onRestart={onRestart}
      />,
    );
    expect(screen.getByRole('alertdialog', { name: 'Level failed' })).toBeInTheDocument();
    expect(screen.getByTestId('failure-reason')).toHaveTextContent('Time is up.');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Restart level']);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restart level' }));
    expect(onRestart).toHaveBeenCalled();
  });

  it('shows nothing while the level is in progress', () => {
    const { container } = render(<ResultDialog loadId={1} outcome={null} onRestart={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('LevelPicker with progress', () => {
  it('locks levels until the previous one is completed and shows stars', () => {
    const levels = loadLevelIndex().levels;
    const { rerender } = render(
      <LevelPicker levels={levels} currentId="level-001" onSelect={vi.fn()} />,
    );
    const option = (name: RegExp) => screen.getByRole('option', { name });
    expect(option(/Round Trip/)).toBeDisabled();
    expect(option(/Round Trip/)).toHaveTextContent('🔒 Round Trip');
    expect(option(/Sandbox/)).toBeEnabled();

    rerender(
      <LevelPicker
        levels={levels}
        results={{ 'level-001': { stars: 2, bestScore: 100 } }}
        currentId="level-001"
        onSelect={vi.fn()}
      />,
    );
    expect(option(/First Run/)).toHaveTextContent('First Run ★★☆');
    expect(option(/Round Trip/)).toBeEnabled();
    expect(option(/Dead End Port/)).toBeDisabled();
  });
});

describe('formatMoney', () => {
  it('formats negative amounts with a leading minus', () => {
    expect(formatMoney(-982)).toBe('−$982');
  });
});
