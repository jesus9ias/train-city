import type { Level } from '../../data/schemas/level';
import { balance, buildCost } from '../economy/ledger';
import type { GameState, Outcome, RulesContext } from '../game/state';
import { TICK_SECONDS } from '../constants';
import { FAILURE_CHECKS } from './failureChecks';

export type Objective = Level['objectives'][number];
export type StarTier = Level['scoring']['stars'][number];

/**
 * Delivered amount toward an objective. MVP: every delivery of the cargo at the destination
 * counts; `from` is informational (cargo does not remember its origin yet).
 */
export function objectiveProgress(state: GameState, objective: Objective): number {
  return state.run.delivered[objective.to]?.[objective.cargo] ?? 0;
}

export function isObjectiveDone(state: GameState, objective: Objective): boolean {
  return objectiveProgress(state, objective) >= objective.amount;
}

export type Performance = { seconds: number; fuelUsed: number; buildCost: number };

export function performanceOf(state: GameState): Performance {
  return {
    seconds: state.elapsedTicks * TICK_SECONDS,
    fuelUsed: state.run.fuelUsedTotal,
    buildCost: buildCost(state.ledger),
  };
}

/** Stars earned: the best tier whose every condition is met (tiers are listed best first). */
export function starsFor(perf: Performance, tiers: readonly StarTier[]): number {
  const tier = tiers.find(
    (t) =>
      (t.maxSeconds === undefined || perf.seconds <= t.maxSeconds) &&
      (t.maxFuel === undefined || perf.fuelUsed <= t.maxFuel) &&
      (t.maxBuildCost === undefined || perf.buildCost <= t.maxBuildCost),
  );
  return tier?.stars ?? 0;
}

/** Net profit, the level's score (spec.md §4.12). Unlimited money scores by revenue. */
export function scoreOf(state: GameState): number {
  const money = balance(state.initialMoney, state.ledger);
  return money === null || state.initialMoney === null
    ? state.ledger.revenue
    : Math.round((money - state.initialMoney) * 100) / 100;
}

/**
 * Completion first (finishing on the last tick still counts), then the pluggable failure
 * checks. Levels without objectives (sandbox) never end.
 */
export function evaluateOutcome(state: GameState, ctx: RulesContext): Outcome | null {
  if (state.run.outcome || ctx.objectives.length === 0) return state.run.outcome;
  if (ctx.objectives.every((o) => isObjectiveDone(state, o))) {
    const perf = performanceOf(state);
    return {
      kind: 'completed',
      stars: starsFor(perf, ctx.scoring.stars),
      score: scoreOf(state),
      ...perf,
    };
  }
  for (const check of FAILURE_CHECKS) {
    const reason = check(state, ctx);
    if (reason) return { kind: 'failed', reason };
  }
  return null;
}
