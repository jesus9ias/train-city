import type { TrainState } from '../core/sim/train';
import type { ReadySession } from '../state/gameStore';
import type { AppStores } from '../state/stores';

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

/** Run Mode side panel: every train with a start/stop button. */
export function RunPanel({ stores, session }: { stores: AppStores; session: ReadySession }) {
  const { catalogs } = session.ctx;
  const { trains } = session.game;
  return (
    <aside className="side-panel palette" aria-label="Trains">
      <h2>Trains</h2>
      {trains.length === 0 ? (
        <p className="muted">No trains yet. Switch to the Editor to buy one.</p>
      ) : (
        <ul className="train-list">
          {trains.map((train) => (
            <li key={train.id}>
              <button
                type="button"
                className="palette__item"
                onClick={() => {
                  stores.editor.getState().selectTrain(train.id);
                }}
              >
                <span className="palette__name">
                  {catalogs.locomotives[train.locomotive]?.name ?? train.locomotive} {train.id}
                </span>
                <span className="palette__price">{STATUS_TEXT[train.status]}</span>
              </button>
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
            </li>
          ))}
        </ul>
      )}
      <p className="palette__hint">Click a switch on the map to flip it.</p>
    </aside>
  );
}
