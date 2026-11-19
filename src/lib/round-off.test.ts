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

import { roundOffOffer, withManualRoundOff, paymentSummary } from './payment-logic';

describe('the cashier rounds the bill to what the guest paid', () => {
  const bill = computeTotals([line(1662, 1)], 30, 0, { exempt: true, roundToRupee: true }); // ₹1163, auto −0.40

  it('guest pays ₹1162 on ₹1163: offered, settles at ₹1162 with −₹1.40 round-off, and the cloud rule passes', () => {
    const entries = [{ mode: 'upi' as const, amount: 662 }, { mode: 'cash' as const, amount: 500 }];
    expect(roundOffOffer(entries, bill.total, bill.roundOff)).toEqual({ payTotal: 1162, adjust: -1 });
    const t = withManualRoundOff(bill, 1163, 1162);
    if (typeof t === 'string') throw new Error(t);
    expect(t.total).toBe(1162);
    expect(t.roundOff).toBe(-1.4);
    expect(t.taxable).toBe(1163.4); // tax and GST figures are untouched
    expect(settledValueProblem(t)).toBeNull();
    expect(paymentSummary(entries, t.total).complete).toBe(true);
    expect(settledPayments(entries, t.total).reduce((s, p) => s + p.amount, 0)).toBe(1162);
  });

  it('UPI of ₹1165 on ₹1163 with no cash: round up +₹2 instead of refusing', () => {
    expect(roundOffOffer([{ mode: 'upi', amount: 1165 }], 1163, -0.4)).toEqual({ payTotal: 1165, adjust: 2 });
  });

  it('cash over is change, not round-off', () => {
    expect(roundOffOffer([{ mode: 'cash', amount: 1200 }], 1163, -0.4)).toBeNull();
  });

  it('nothing to offer when the payment is exact or nothing is entered', () => {
    expect(roundOffOffer([{ mode: 'cash', amount: 1163 }], 1163, -0.4)).toBeNull();
    expect(roundOffOffer([{ mode: 'cash', amount: 0 }], 1163, -0.4)).toBeNull();
  });

  it('the whole round-off stays within ±₹100', () => {
    expect(roundOffOffer([{ mode: 'cash', amount: 1063.4 }], 1163, -0.4)).toEqual({ payTotal: 1063.4, adjust: -99.6 });
    expect(roundOffOffer([{ mode: 'cash', amount: 1063 }], 1163, -0.4)).toBeNull();
    expect(withManualRoundOff(bill, 1163, 1062)).toMatch(/can't be more than ₹100/);
  });

  it('refuses if the bill changed on another device after payment was entered', () => {
    expect(withManualRoundOff(bill, 1100, 1099)).toMatch(/This bill is now 1,163/);
  });
});
