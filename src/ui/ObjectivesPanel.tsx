import { TICK_SECONDS } from '../core/constants';
import { objectiveProgress, performanceOf, starsFor } from '../core/objectives/objectives';
import type { ReadySession } from '../state/gameStore';
import { formatClock } from './format';

export function Stars({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${count} of ${max} stars`}>
      {'★'.repeat(count)}
      <span className="stars__empty">{'☆'.repeat(Math.max(0, max - count))}</span>
    </span>
  );
}

/** Level goals, progress and the stars the player would get by finishing now (spec.md §6.2). */
export function ObjectivesPanel({ session }: { session: ReadySession }) {
  const { game, ctx, level } = session;
  if (ctx.objectives.length === 0) return null;
  const { catalogs } = ctx;
  const stationName = (id: string) => game.world.stations.find((s) => s.id === id)?.name ?? id;
  const perf = performanceOf(game);
  const limit = ctx.constraints.timeLimitSeconds;
  const projected = starsFor(perf, ctx.scoring.stars);

  return (
    <section className="objectives" aria-label="Objectives" data-testid="objectives">
      <h2>Objectives</h2>
      <ul>
        {ctx.objectives.map((objective) => {
          const cargo = catalogs.cargoTypes[objective.cargo];
          const done = Math.min(objectiveProgress(game, objective), objective.amount);
          return (
            <li key={objective.id}>
              <span>
                {done >= objective.amount ? '✓ ' : ''}
                Deliver {objective.amount} {cargo?.unit} {cargo?.name.toLowerCase()} to{' '}
                {stationName(objective.to)}
              </span>
              <progress
                max={objective.amount}
                value={done}
                aria-label={`${objective.id} progress`}
              />
              <span className="objectives__count" data-testid={`objective-${objective.id}`}>
                {Math.floor(done)}/{objective.amount}
              </span>
            </li>
          );
        })}
      </ul>
      <dl className="inspector__facts">
        <dt>Time</dt>
        <dd data-testid="time-left">
          {formatClock(game.elapsedTicks)}
          {limit !== undefined && ` / ${formatClock(Math.round(limit / TICK_SECONDS))}`}
        </dd>
        <dt>Fuel used</dt>
        <dd>{Math.round(perf.fuelUsed)}</dd>
        {level.scoring.stars.length > 0 && !game.run.outcome && (
          <>
            <dt>If you finish now</dt>
            <dd data-testid="projected-stars">
              <Stars count={projected} />
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
