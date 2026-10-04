import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  balance,
  buildCost,
  canAfford,
  EMPTY_LEDGER,
  LEDGER_CATEGORIES,
  record,
  roundMoney,
} from './ledger';

describe('ledger', () => {
  it('computes the balance from income and expenses', () => {
    let ledger = record(EMPTY_LEDGER, 'build', 840);
    ledger = record(ledger, 'objects', 15);
    ledger = record(ledger, 'trains', 670);
    ledger = record(ledger, 'fuel', 132.5);
    ledger = record(ledger, 'revenue', 500);
    expect(balance(2500, ledger)).toBe(1342.5);
    expect(buildCost(ledger)).toBe(1525);
  });

  it('treats null initial money as unlimited', () => {
    const ledger = record(EMPTY_LEDGER, 'build', 1e9);
    expect(balance(null, ledger)).toBeNull();
    expect(canAfford(null, ledger, 1e9)).toBe(true);
  });

  it('checks affordability', () => {
    expect(canAfford(10, EMPTY_LEDGER, 10)).toBe(true);
    expect(canAfford(5, EMPTY_LEDGER, 10)).toBe(false);
  });

  it('refunds reduce the build cost', () => {
    const ledger = record(record(EMPTY_LEDGER, 'build', 10), 'refunds', 5);
    expect(buildCost(ledger)).toBe(5);
  });

  it('recording zero keeps the same ledger', () => {
    expect(record(EMPTY_LEDGER, 'build', 0)).toBe(EMPTY_LEDGER);
  });

  it('always balances: initial + income − expenses, rounded to cents', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.constantFrom(...LEDGER_CATEGORIES), fc.integer({ min: 1, max: 100000 })),
          { maxLength: 30 },
        ),
        (entries) => {
          let ledger = EMPTY_LEDGER;
          let expected = 1000;
          for (const [category, cents] of entries) {
            ledger = record(ledger, category, cents / 100);
            expected += (category === 'revenue' || category === 'refunds' ? 1 : -1) * cents;
          }
          expect(balance(10, ledger)).toBe(roundMoney(expected / 100));
        },
      ),
    );
  });
});
