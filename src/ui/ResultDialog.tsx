import { useState } from 'react';
import type { Outcome } from '../core/game/state';
import { Dialog } from './Dialog';
import { formatMoney } from './format';
import { Stars } from './ObjectivesPanel';

type Props = {
  /** Changes on every (re)load, so a new run shows its result again. */
  loadId: number;
  outcome: Outcome | null;
  onRestart: () => void;
  /** Present when there is a next level to go to. */
  onNextLevel?: (() => void) | undefined;
};

const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** End-of-level screen: stars and stats, or why the level was lost (spec.md §5.2). */
export function ResultDialog({ loadId, outcome, onRestart, onNextLevel }: Props) {
  const [dismissed, setDismissed] = useState<number | null>(null);
  if (!outcome || dismissed === loadId) return null;

  if (outcome.kind === 'failed') {
    // Losing leaves only one way forward (spec.md §4.13), so the dialog cannot be dismissed.
    return (
      <Dialog
        title="Level failed"
        tone="error"
        onClose={() => undefined}
        actions={
          <button type="button" className="tool-button" onClick={onRestart}>
            Restart level
          </button>
        }
      >
        <p data-testid="failure-reason">{outcome.reason}.</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Level complete!"
      onClose={() => {
        setDismissed(loadId);
      }}
      actions={
        <>
          <button
            type="button"
            className="tool-button"
            onClick={() => {
              setDismissed(loadId);
            }}
          >
            Close
          </button>
          <button type="button" className="tool-button" onClick={onRestart}>
            Restart level
          </button>
          {onNextLevel && (
            <button
              type="button"
              className="tool-button tool-button--primary"
              onClick={onNextLevel}
            >
              Next level
            </button>
          )}
        </>
      }
    >
      <p className="result__stars" data-testid="result-stars">
        <Stars count={outcome.stars} />
      </p>
      <dl className="inspector__facts">
        <dt>Time</dt>
        <dd>{duration(outcome.seconds)}</dd>
        <dt>Fuel used</dt>
        <dd>{Math.round(outcome.fuelUsed)}</dd>
        <dt>Build cost</dt>
        <dd>{formatMoney(outcome.buildCost)}</dd>
        <dt>Score (profit)</dt>
        <dd data-testid="result-score">{formatMoney(outcome.score)}</dd>
      </dl>
    </Dialog>
  );
}
