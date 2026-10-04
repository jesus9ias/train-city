import { useStore } from 'zustand';
import type { ReadySession } from '../state/gameStore';
import type { AppStores } from '../state/stores';
import { SIM_SPEEDS } from '../state/viewStore';
import { formatClock } from './format';

type Props = { stores: AppStores; session: ReadySession };

/** Editor/Run switch plus simulation controls (spec.md §6.2). */
export function ModeBar({ stores, session }: Props) {
  const simSpeed = useStore(stores.view, (s) => s.simSpeed);
  const { mode, paused, elapsedTicks } = session.game;
  const { startRun, enterEditor, setPaused } = stores.game.getState();
  const running = mode === 'running';

  return (
    <div className="mode-bar" role="group" aria-label="Game mode">
      <div className="segmented">
        <button type="button" aria-pressed={!running} onClick={enterEditor} title="Editor (Tab)">
          Editor
        </button>
        <button type="button" aria-pressed={running} onClick={startRun} title="Run (Tab)">
          Run
        </button>
      </div>
      {running && (
        <>
          <button
            type="button"
            className="tool-button"
            onClick={() => {
              setPaused(!paused);
            }}
            title="Play / pause (P)"
          >
            {paused ? '▶ Play' : '⏸ Pause'}
          </button>
          <div className="segmented" role="group" aria-label="Simulation speed">
            {SIM_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={simSpeed === speed}
                onClick={() => {
                  stores.view.getState().setSimSpeed(speed);
                }}
              >
                ×{speed}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="mode-bar__clock" data-testid="clock" title="Simulated time">
        ⏱ {formatClock(elapsedTicks)}
      </span>
    </div>
  );
}
