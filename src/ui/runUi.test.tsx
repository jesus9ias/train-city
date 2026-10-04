import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { LevelInput } from '../data/schemas/level';
import { createEditorController } from '../state/editorController';
import type { ReadySession } from '../state/gameStore';
import { createAppStores, type AppStores } from '../state/stores';
import { makeLevel, testCatalogs } from '../test/fixtures';
import { formatClock } from './format';
import { ModeBar } from './ModeBar';
import { TrainBuilder } from './TrainBuilder';
import { RunPanel, TrainPanel } from './TrainPanel';
import { useShortcuts } from './useShortcuts';

const at = (x: number, y: number) => ({ x, y });
const vertical = Array.from({ length: 10 }, (_, i) => ({
  at: at(5, i + 1),
  piece: 'straight',
  rotation: 0,
}));

async function storesWith(extra: Partial<LevelInput> = {}): Promise<AppStores> {
  const level = makeLevel({ tracks: vertical }, extra);
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

function placeTrain(stores: AppStores) {
  const outcome = stores.game.getState().execute({
    type: 'placeTrain',
    cell: at(5, 3),
    locomotive: 'loco_steam',
    wagons: ['wagon_hopper'],
    facing: 'N',
  });
  if (!outcome.ok) throw new Error(outcome.reason);
}

/** Re-renders on every store change, like the app does. */
function Live({ stores, view }: { stores: AppStores; view: (s: ReadySession) => React.ReactNode }) {
  return <>{view(ready(stores))}</>;
}

describe('ModeBar', () => {
  it('switches modes, pauses and changes speed', async () => {
    const stores = await storesWith();
    const { rerender } = render(<ModeBar stores={stores} session={ready(stores)} />);
    const refresh = () => {
      rerender(<ModeBar stores={stores} session={ready(stores)} />);
    };
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    refresh();
    expect(ready(stores).game.mode).toBe('running');
    await userEvent.click(screen.getByRole('button', { name: /Pause/ }));
    refresh();
    expect(ready(stores).game.paused).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /Play/ }));
    await userEvent.click(screen.getByRole('button', { name: '×4' }));
    expect(stores.view.getState().simSpeed).toBe(4);

    act(() => {
      stores.game.getState().tick(1250);
    });
    refresh();
    expect(screen.getByTestId('clock')).toHaveTextContent('01:02');

    await userEvent.click(screen.getByRole('button', { name: 'Editor' }));
    expect(ready(stores).game.mode).toBe('editing');
  });

  it('formats simulated time', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(20 * 75)).toBe('01:15');
  });
});

describe('TrainBuilder', () => {
  it('composes a train, shows its price and selects the placing tool', async () => {
    const stores = await storesWith();
    const { rerender } = render(<TrainBuilder stores={stores} session={ready(stores)} />);
    const refresh = () => {
      rerender(<TrainBuilder stores={stores} session={ready(stores)} />);
    };
    // Steam 300 + fuel 500 × 0.5
    expect(screen.getByTestId('train-price')).toHaveTextContent('$300 + fuel $250 = $550');

    await userEvent.click(screen.getByRole('button', { name: 'Add Hopper' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Boxcar' }));
    refresh();
    expect(screen.getByTestId('train-price')).toHaveTextContent('$430 + fuel $250 = $680');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Hopper 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Place train' }));
    expect(stores.editor.getState().tool).toEqual({
      kind: 'train',
      locomotive: 'loco_steam',
      wagons: ['wagon_box'],
    });

    // Changing the composition updates the active tool.
    refresh();
    await userEvent.click(screen.getByRole('button', { name: /Diesel/ }));
    expect(stores.editor.getState().tool).toMatchObject({ locomotive: 'loco_diesel' });
  });

  it('limits wagons to what the locomotive can pull', async () => {
    const stores = await storesWith();
    stores.editor.getState().setTrainDraft({
      locomotive: 'loco_steam',
      wagons: Array<string>(5).fill('wagon_hopper'),
    });
    render(<TrainBuilder stores={stores} session={ready(stores)} />);
    expect(screen.getByRole('button', { name: 'Add Hopper' })).toBeDisabled();
  });

  it('explains when no locomotive is allowed', async () => {
    const stores = await storesWith({
      editorRules: {
        allowTerrainEdit: false,
        allowObjectEdit: false,
        maxTrains: 1,
        allowedLocomotives: [],
      },
    });
    render(<TrainBuilder stores={stores} session={ready(stores)} />);
    expect(screen.getByText('No locomotives are available in this level.')).toBeInTheDocument();
  });
});

describe('RunPanel and TrainPanel', () => {
  it('starts and stops trains', async () => {
    const stores = await storesWith();
    placeTrain(stores);
    const { rerender } = render(<RunPanel stores={stores} session={ready(stores)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start t1' }));
    expect(ready(stores).game.trains[0]?.running).toBe(true);
    rerender(<RunPanel stores={stores} session={ready(stores)} />);
    await userEvent.click(screen.getByRole('button', { name: /Steam t1/ }));
    expect(stores.editor.getState().selectedTrain).toBe('t1');
  });

  it('shows an empty state', async () => {
    const stores = await storesWith();
    render(<RunPanel stores={stores} session={ready(stores)} />);
    expect(screen.getByText(/No trains yet/)).toBeInTheDocument();
  });

  it('shows the selected train and toggles it', async () => {
    const stores = await storesWith();
    placeTrain(stores);
    render(
      <Live
        stores={stores}
        view={(s) => {
          const train = s.game.trains[0];
          return train ? <TrainPanel stores={stores} session={s} train={train} /> : null;
        }}
      />,
    );
    expect(screen.getByTestId('train-status')).toHaveTextContent('Stopped');
    expect(screen.getByTestId('train-panel')).toHaveTextContent('Hopper');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(ready(stores).game.trains[0]?.running).toBe(true);
  });
});

describe('run-mode clicks', () => {
  it('select trains and flip switches; failures are reported', async () => {
    const level = makeLevel({
      tracks: [
        ...vertical,
        { at: at(5, 0), piece: 'switch', rotation: 0 },
        { at: at(8, 8), piece: 'switch', rotation: 0 },
      ],
    });
    const stores = createAppStores({
      catalogs: testCatalogs,
      levels: [],
      loadLevel: () => Promise.resolve(level),
    });
    await stores.game.getState().loadLevel(level.id);
    stores.game.getState().execute({
      type: 'placeTrain',
      cell: at(5, 0),
      locomotive: 'loco_steam',
      wagons: [],
      facing: 'N',
    });
    stores.game.getState().startRun();
    const controller = createEditorController(stores);

    controller.down(at(5, 0)); // the train sits on this switch
    controller.up();
    expect(stores.editor.getState().selectedTrain).toBe('t1');

    controller.down(at(8, 8));
    controller.up();
    expect(ready(stores).game.world.tracks.find((t) => t.at.x === 8)?.state).toBe(1);

    controller.down(at(20, 20)); // empty ground: deselects, no notice
    controller.up();
    expect(stores.editor.getState().selectedTrain).toBeNull();
    expect(stores.editor.getState().notice).toBeNull();

    // An occupied switch reports why it cannot flip.
    stores.game.getState().enterEditor();
    stores.game.getState().startRun();
    const result = stores.game.getState().flipSwitch(at(5, 0));
    expect(result).toEqual({ ok: false, reason: 'Switch occupied' });
  });
});

describe('run shortcuts', () => {
  function Harness({ stores }: { stores: AppStores }) {
    useShortcuts(stores);
    return <button type="button">focusable</button>;
  }

  it('Tab toggles modes from the map, P pauses, Escape deselects the train', async () => {
    const stores = await storesWith();
    render(<Harness stores={stores} />);
    await userEvent.keyboard('{Tab}'); // focus is on the body: switches mode
    expect(ready(stores).game.mode).toBe('running');
    await userEvent.keyboard('p');
    expect(ready(stores).game.paused).toBe(true);
    stores.editor.getState().selectTrain('t1');
    await userEvent.keyboard('{Escape}');
    expect(stores.editor.getState().selectedTrain).toBeNull();

    screen.getByRole('button', { name: 'focusable' }).focus();
    await userEvent.keyboard('{Tab}'); // focus on a control: normal tab navigation
    expect(ready(stores).game.mode).toBe('running');
  });

  it('P does nothing in the editor', async () => {
    const stores = await storesWith();
    render(<Harness stores={stores} />);
    await userEvent.keyboard('p');
    expect(ready(stores).game.paused).toBe(false);
  });
});
