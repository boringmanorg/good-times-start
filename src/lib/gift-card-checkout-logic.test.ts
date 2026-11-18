import { describe, expect, it } from 'vitest';
import { giftPaymentProblem } from './gift-card-checkout-logic';
import { settledPayments, paymentSummary } from './payment-logic';

describe('gift-card checkout', () => {
  it('links the card code and keeps a cash split on a ₹500 bill', () => {
    const payments = [{ mode: 'gift_card' as const, amount: 300, giftCardCode: ' gc abc ' }, { mode: 'cash' as const, amount: 250 }];
    expect(paymentSummary(payments, 500).change).toBe(50);
    expect(settledPayments(payments, 500)).toEqual([{ mode: 'gift_card', amount: 300, giftCardCode: 'GCABC' }, { mode: 'cash', amount: 200 }]);
  });
  it('requires a code for the bill-linked gift tender', () => {
    expect(giftPaymentProblem([{ mode: 'gift_card', amount: 500 }])).toBe('Enter the gift card code');
  });
  it('refuses merging different cards into one tender', () => {
    expect(giftPaymentProblem([{ mode: 'gift_card', amount: 100, giftCardCode: 'A' }, { mode: 'gift_card', amount: 100, giftCardCode: 'B' }])).toBe('Use one gift card per bill');
  });
  it('refuses noncash overpayment rather than giving card value as change', () => {
    expect(paymentSummary([{ mode: 'gift_card', amount: 501, giftCardCode: 'A' }], 500).complete).toBe(false);
  });
});