import { useStore } from 'zustand';
import { roundMoney } from '../core/economy/ledger';
import type { ReadySession } from '../state/gameStore';
import { trainCount } from '../state/selectors';
import type { AppStores } from '../state/stores';
import { formatMoney } from './format';
import { TrainList } from './TrainPanel';

type Props = { stores: AppStores; session: ReadySession };

/** Palette tab to compose a train (locomotive + wagons) and place it on the track. */
export function TrainBuilder({ stores, session }: Props) {
  const { catalogs, rules, economy } = session.ctx;
  const tool = useStore(stores.editor, (s) => s.tool);
  const draft = useStore(stores.editor, (s) => s.trainDraft);
  const { setTrainDraft, selectTool } = stores.editor.getState();

  const locomotives = Object.values(catalogs.locomotives).filter(
    (l) => rules.allowedLocomotives?.includes(l.id) ?? true,
  );
  const wagonTypes = Object.values(catalogs.wagons).filter(
    (w) => rules.allowedWagons?.includes(w.id) ?? true,
  );
  const loco = catalogs.locomotives[draft.locomotive ?? ''] ?? locomotives[0];
  if (!loco) return <p className="muted">No locomotives are available in this level.</p>;

  const wagons = draft.wagons.filter((id) => catalogs.wagons[id]);
  const full = wagons.length >= loco.maxWagons;
  const vehicles =
    loco.cost + wagons.reduce((sum, id) => sum + (catalogs.wagons[id]?.cost ?? 0), 0);
  const fuel = roundMoney(loco.fuelCapacity * economy.fuelPrice);
  const placing = tool?.kind === 'train';
  const atLimit = rules.maxTrains !== null && session.game.trains.length >= rules.maxTrains;
  const update = (next: { locomotive?: string; wagons?: readonly string[] }) => {
    setTrainDraft({ locomotive: next.locomotive ?? loco.id, wagons: next.wagons ?? wagons });
  };

  return (
    <div className="train-builder">
      <fieldset>
        <legend>Locomotive</legend>
        {locomotives.map((l) => (
          <button
            key={l.id}
            type="button"
            className="palette__item"
            aria-pressed={l.id === loco.id}
            onClick={() => {
              update({ locomotive: l.id, wagons: wagons.slice(0, l.maxWagons) });
            }}
          >
            <span className="palette__name">
              {l.name} <span className="muted">· {l.maxSpeed} cells/s</span>
            </span>
            <span className="palette__price">{formatMoney(l.cost)}</span>
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>
          Wagons {wagons.length}/{loco.maxWagons}
        </legend>
        {wagonTypes.map((w) => (
          <button
            key={w.id}
            type="button"
            className="palette__item"
            disabled={full}
            aria-label={`Add ${w.name}`}
            onClick={() => {
              update({ wagons: [...wagons, w.id] });
            }}
          >
            <span className="palette__name">+ {w.name}</span>
            <span className="palette__price">{formatMoney(w.cost)}</span>
          </button>
        ))}
        {wagons.length > 0 && (
          <ol className="train-builder__consist" aria-label="Train composition">
            {wagons.map((id, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="chip"
                  aria-label={`Remove ${catalogs.wagons[id]?.name ?? id} ${i + 1}`}
                  onClick={() => {
                    update({ wagons: wagons.filter((_, j) => j !== i) });
                  }}
                >
                  {catalogs.wagons[id]?.name ?? id} ✕
                </button>
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      <p className="train-builder__total" data-testid="train-price">
        {formatMoney(vehicles)} + fuel {formatMoney(fuel)} ={' '}
        {formatMoney(roundMoney(vehicles + fuel))}
      </p>
      <button
        type="button"
        className="tool-button"
        aria-pressed={placing}
        disabled={atLimit && !placing}
        onClick={() => {
          selectTool(placing ? null : { kind: 'train', locomotive: loco.id, wagons });
        }}
      >
        Place train
      </button>
      <p className="palette__hint">
        {atLimit
          ? 'Train limit reached: scrap a train to buy another'
          : 'Click a track to place it · R turns it around'}
      </p>

      <h3 className="train-builder__heading">
        Your trains <span data-testid="train-count">{trainCount(session)}</span>
      </h3>
      <TrainList stores={stores} session={session} controls="edit" />
    </div>
  );
}
