import { scrapRefund } from '../core/editor/actions';
import type { TrainState } from '../core/sim/train';
import type { ReadySession } from '../state/gameStore';
import { trainCount } from '../state/selectors';
import type { AppStores } from '../state/stores';
import { formatDelta } from './format';

const STATUS_TEXT: Record<TrainState['status'], string> = {
  stopped: 'Stopped',
  running: 'Running',
  loading: 'Loading',
  blocked: 'Blocked: the track ends',
  derailed: 'Derailed',
  out_of_fuel: 'Out of fuel',
};

type Props = { stores: AppStores; session: ReadySession; train: TrainState };

/** Details and controls of one train. */
export function TrainPanel({ stores, session, train }: Props) {
  const { catalogs } = session.ctx;
  const loco = catalogs.locomotives[train.locomotive];
  const canStart = train.status !== 'derailed';

  return (
    <section className="train-panel" data-testid="train-panel">
      <h2>
        {loco?.name ?? train.locomotive} train {train.id}
      </h2>
      <dl className="inspector__facts">
        <dt>Status</dt>
        <dd data-testid="train-status">{STATUS_TEXT[train.status]}</dd>
        <dt>Speed</dt>
        <dd>{train.speed.toFixed(1)} cells/s</dd>
        <dt>Fuel</dt>
        <dd>
          {Math.round(train.fuel)} / {loco?.fuelCapacity ?? '?'}
        </dd>
        <dt>Wagons</dt>
        <dd>{train.wagons.length ? '' : 'none'}</dd>
      </dl>
      {train.wagons.length > 0 && (
        <ul className="wagon-list" data-testid="wagon-list">
          {train.wagons.map((wagon, i) => {
            const def = catalogs.wagons[wagon.model];
            const cargo = wagon.cargo ? catalogs.cargoTypes[wagon.cargo] : undefined;
            return (
              <li key={i}>
                {def?.name ?? wagon.model}:{' '}
                {cargo
                  ? `${Math.floor(wagon.amount)}/${def?.capacity ?? '?'} ${cargo.unit} ${cargo.name.toLowerCase()}`
                  : 'empty'}
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className="tool-button"
        disabled={!canStart}
        onClick={() => {
          stores.game.getState().setTrainRunning(train.id, !train.running);
        }}
      >
        {train.running ? 'Stop' : 'Start'}
      </button>
    </section>
  );
}

/** Short cargo summary of a train: `30 t coal, 12 pax passengers` or `empty`. */
function cargoSummary(train: TrainState, catalogs: ReadySession['ctx']['catalogs']): string {
  const totals = new Map<string, number>();
  for (const wagon of train.wagons) {
    if (wagon.cargo && wagon.amount > 0) {
      totals.set(wagon.cargo, (totals.get(wagon.cargo) ?? 0) + wagon.amount);
    }
  }
  if (totals.size === 0) return train.wagons.length ? 'empty' : 'no wagons';
  return [...totals]
    .map(([id, amount]) => {
      const cargo = catalogs.cargoTypes[id];
      return `${Math.floor(amount)} ${cargo?.unit ?? ''} ${cargo?.name.toLowerCase() ?? id}`;
    })
    .join(', ');
}

type ListProps = { stores: AppStores; session: ReadySession };

/**
 * Every train with its state at a glance. Run Mode starts and stops them; Editor Mode scraps
 * them (spec.md §6, Stage 6). Clicking a train selects it.
 */
export function TrainList({ stores, session, controls }: ListProps & { controls: 'run' | 'edit' }) {
  const { catalogs, economy } = session.ctx;
  const { trains } = session.game;
  const editing = controls === 'edit';
  if (trains.length === 0) {
    return (
      <p className="muted" data-testid="no-trains">
        {editing ? 'No trains yet.' : 'No trains yet. Switch to the Editor to buy one.'}
      </p>
    );
  }
  return (
    <ul className="train-list" data-testid="train-list">
      {trains.map((train) => {
        const loco = catalogs.locomotives[train.locomotive];
        const name = `${loco?.name ?? train.locomotive} ${train.id}`;
        const fuel = loco ? Math.round((train.fuel / loco.fuelCapacity) * 100) : 0;
        return (
          <li key={train.id}>
            <button
              type="button"
              className="palette__item"
              aria-label={`Select ${name}`}
              onClick={() => {
                stores.editor.getState().selectTrain(train.id);
              }}
            >
              <span className="palette__name">{name}</span>
              <span className="palette__price">
                {STATUS_TEXT[train.status]} · ⛽ {fuel}% · {cargoSummary(train, catalogs)}
              </span>
            </button>
            {editing ? (
              <button
                type="button"
                className="tool-button"
                aria-label={`Scrap ${train.id}`}
                title={`Scrap for ${formatDelta(scrapRefund(session.game, economy.refundRatio, train))}`}
                onClick={() => {
                  const outcome = stores.game
                    .getState()
                    .execute({ type: 'erase', cell: train.head.cell });
                  if (!outcome.ok) stores.editor.getState().notify(outcome.reason);
                }}
              >
                Scrap
              </button>
            ) : (
              <button
                type="button"
                className="tool-button"
                disabled={train.status === 'derailed'}
                aria-label={`${train.running ? 'Stop' : 'Start'} ${train.id}`}
                onClick={() => {
                  stores.game.getState().setTrainRunning(train.id, !train.running);
                }}
              >
                {train.running ? 'Stop' : 'Start'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Run Mode side panel: every train with a start/stop button. */
export function RunPanel({ stores, session }: ListProps) {
  return (
    <aside className="side-panel palette" aria-label="Trains">
      <h2>
        Trains <span data-testid="train-count">{trainCount(session)}</span>
      </h2>
      <TrainList stores={stores} session={session} controls="run" />
      <p className="palette__hint">
        Click a switch on the map to flip it. Trains on the same track crash: both are lost.
      </p>
    </aside>
  );
}
