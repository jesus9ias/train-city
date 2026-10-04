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

describe('train list (Stage 6)', () => {
  function placeAt(stores: AppStores, y: number) {
    const outcome = stores.game.getState().execute({
      type: 'placeTrain',
      cell: at(5, y),
      locomotive: 'loco_steam',
      wagons: [],
      facing: 'N',
    });
    if (!outcome.ok) throw new Error(outcome.reason);
  }

  it('counts trains against the level limit and blocks buying more', async () => {
    const stores = await storesWith({
      economy: { initialMoney: 5000, fuelPrice: 0.5 },
      editorRules: { allowTerrainEdit: true, allowObjectEdit: true, maxTrains: 2 },
    });
    const view = () => <TrainBuilder stores={stores} session={ready(stores)} />;
    const { rerender } = render(view());
    expect(screen.getByTestId('train-count')).toHaveTextContent('0/2');
    expect(screen.getByTestId('no-trains')).toHaveTextContent('No trains yet.');
    placeAt(stores, 2);
    placeAt(stores, 6);
    rerender(view());
    expect(screen.getByTestId('train-count')).toHaveTextContent('2/2');
    expect(screen.getByRole('button', { name: 'Place train' })).toBeDisabled();
    expect(screen.getByText(/Train limit reached/)).toBeInTheDocument();
    expect(screen.getByTestId('train-list')).toHaveTextContent('Stopped · ⛽ 100% · no wagons');

    // Scrapping frees a slot and refunds the train (bought in this editor session: 100%).
    await userEvent.click(screen.getByRole('button', { name: 'Scrap t1' }));
    expect(ready(stores).game.trains.map((t) => t.id)).toEqual(['t2']);
    rerender(view());
    expect(screen.getByTestId('train-count')).toHaveTextContent('1/2');
    expect(screen.getByRole('button', { name: 'Place train' })).toBeEnabled();
  });

  it('shows cargo and only a plain count without a limit', async () => {
    const stores = await storesWith();
    placeTrain(stores);
    stores.game.getState().startRun();
    render(<RunPanel stores={stores} session={ready(stores)} />);
    expect(screen.getByTestId('train-count')).toHaveTextContent(/^1$/);
    expect(screen.getByTestId('train-list')).toHaveTextContent('empty');
    expect(screen.queryByRole('button', { name: 'Scrap t1' })).not.toBeInTheDocument();
  });

  it('reports a failed scrap', async () => {
    const stores = await storesWith();
    placeTrain(stores);
    const session = ready(stores);
    render(<TrainBuilder stores={stores} session={session} />);
    stores.game.getState().startRun(); // the list still shows Editor buttons from the old render
    await userEvent.click(screen.getByRole('button', { name: 'Scrap t1' }));
    expect(stores.editor.getState().notice?.text).toBe('Switch to Editor Mode to build');
  });
});
