import { TICK_MS } from '../core/constants';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** `$2,500`, or `∞` for unlimited money. */
export function formatMoney(value: number | null): string {
  if (value === null) return '∞';
  return `${value < 0 ? '−' : ''}$${money.format(Math.abs(value))}`;
}

/** Money change of an action: `−$10`, `+$5` or `Free`. */
export function formatDelta(delta: number): string {
  if (delta === 0) return 'Free';
  return `${delta < 0 ? '−' : '+'}$${money.format(Math.abs(delta))}`;
}

/** `mm:ss` of simulated time. */
export function formatClock(ticks: number): string {
  const seconds = Math.floor((ticks * TICK_MS) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
