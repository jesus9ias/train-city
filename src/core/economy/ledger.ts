/** Money movements by category (spec.md §4.12). All values are positive amounts. */
export const LEDGER_CATEGORIES = [
  'build',
  'objects',
  'trains',
  'fuel',
  'revenue',
  'refunds',
] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];
export type Ledger = Readonly<Record<LedgerCategory, number>>;

export const EMPTY_LEDGER: Ledger = {
  build: 0,
  objects: 0,
  trains: 0,
  fuel: 0,
  revenue: 0,
  refunds: 0,
};

const INCOME: readonly LedgerCategory[] = ['revenue', 'refunds'];

/** Money values are rounded to 2 decimals at every write to avoid floating-point drift. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function record(ledger: Ledger, category: LedgerCategory, amount: number): Ledger {
  if (amount === 0) return ledger;
  return { ...ledger, [category]: roundMoney(ledger[category] + amount) };
}

/** Current balance, or null when money is unlimited (sandbox). */
export function balance(initialMoney: number | null, ledger: Ledger): number | null {
  if (initialMoney === null) return null;
  const total = LEDGER_CATEGORIES.reduce(
    (sum, category) => sum + (INCOME.includes(category) ? ledger[category] : -ledger[category]),
    initialMoney,
  );
  return roundMoney(total);
}

export function canAfford(initialMoney: number | null, ledger: Ledger, amount: number): boolean {
  const money = balance(initialMoney, ledger);
  return money === null || money >= roundMoney(amount);
}

/** Net money spent on construction (track, object removal and trains) minus refunds. */
export function buildCost(ledger: Ledger): number {
  return roundMoney(ledger.build + ledger.objects + ledger.trains - ledger.refunds);
}
