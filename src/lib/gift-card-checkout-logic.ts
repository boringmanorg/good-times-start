import type { Payment } from './payment-logic';
import { normaliseCode } from './gift-card-logic';

export function giftPaymentProblem(payments: Payment[]): string | null {
  const gifts = payments.filter(p => p.mode === 'gift_card');
  if (gifts.some(p => !normaliseCode(p.giftCardCode ?? ''))) return 'Enter the gift card code';
  if (new Set(gifts.map(p => normaliseCode(p.giftCardCode ?? ''))).size > 1) return 'Use one gift card per bill';
  if (gifts.some(p => !Number.isFinite(p.amount) || p.amount <= 0)) return 'Enter a gift card amount above zero';
  return null;
}