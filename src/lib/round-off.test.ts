import { describe, expect, it } from 'vitest';
import { computeTotals, settledValueProblem, MAX_ROUND_OFF } from './billing';
import { settledPayments } from './payment-logic';
import type { CartLine } from './types';

const line = (price: number, qty: number, gstRate = 5): CartLine => ({ itemId: `i${price}`, name: 'x', price, qty, gstRate } as CartLine);

describe('round-off never blocks a settled bill', () => {
  it('the 18 Nov bill: ₹1662 at 30% is ₹1163 with −₹0.40 round-off, and ₹663 UPI + ₹500 cash settles it', () => {
    const t = computeTotals([line(1662, 1)], 30, 0, { exempt: true, roundToRupee: true });
    expect(t.total).toBe(1163);
    expect(t.roundOff).toBe(-0.4);
    expect(t.taxable).toBe(1163.4);
    expect(settledValueProblem(t)).toBeNull();
    const paid = settledPayments([{ mode: 'upi', amount: 663 }, { mode: 'cash', amount: 500 }], t.total);
    expect(paid.reduce((s, p) => s + p.amount, 0)).toBe(t.total);
  });

  it('every discount 0–100% on every tax setup passes the cloud rule', () => {
    const carts = [[line(1662, 1)], [line(129, 3), line(180, 1), line(99, 2, 18)], [line(0.5, 7)], [line(4999, 1, 12)]];
    const taxes = [{ exempt: true }, { inclusive: true }, {}, { exempt: true, roundToRupee: false }, { inclusive: true, roundToRupee: false }];
    for (const cart of carts) for (const tax of taxes) for (let d = 0; d <= 100; d++) for (const sc of [0, 5, 10]) {
      const t = computeTotals(cart, d, sc, tax);
      expect(settledValueProblem(t), `discount ${d}% sc ${sc}% ${JSON.stringify(tax)}`).toBeNull();
      expect(Math.abs(t.roundOff)).toBeLessThanOrEqual(0.5);
    }
  });

  it('refuses a round-off beyond ₹100 either way', () => {
    expect(settledValueProblem({ total: 1000, taxable: 899, roundOff: MAX_ROUND_OFF + 1 })).toMatch(/Round-off/);
    expect(settledValueProblem({ total: 1000, taxable: 1101, roundOff: -(MAX_ROUND_OFF + 1) })).toMatch(/Round-off/);
    expect(settledValueProblem({ total: 1000, taxable: 1100, roundOff: -100 })).toBeNull();
  });

  it('still refuses a bill worth more than it was settled for', () => {
    expect(settledValueProblem({ total: 1163, taxable: 1200, roundOff: -0.4 })).toMatch(/more than the settled total/);
    expect(settledValueProblem({ total: 1163, taxable: 1163.41, roundOff: 0 })).toMatch(/more than/);
  });
});
