import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { lookupCheckoutCard } from '@/lib/gift-card-checkout';
import { redeemProblem, type GiftCard } from '@/lib/gift-card-logic';
import { formatINR } from '@/lib/billing';
import type { Payment } from '@/lib/payment-logic';

export function GiftCardTender({ payment, onChange, restaurantId }: { payment: Payment; onChange: (change: Partial<Payment>) => void; restaurantId?: string }) {
  const [card, setCard] = useState<GiftCard | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (!restaurantId) { setError('Sign in to check gift cards'); return; }
    setBusy(true); setError('');
    try { setCard(await lookupCheckoutCard(restaurantId, payment.giftCardCode ?? '')); }
    catch (e) { setCard(null); setError(e instanceof Error ? e.message : 'Could not check this card'); }
    finally { setBusy(false); }
  };
  const problem = card ? redeemProblem(card, String(payment.amount), new Date().toLocaleDateString('en-CA')) : '';
  return <div className="space-y-2 pb-2">
    <label className="block text-sm">Gift card code
      <div className="mt-1 flex gap-2">
        <input aria-label="Gift card code" value={payment.giftCardCode ?? ''} onChange={e => { setCard(null); setError(''); onChange({ giftCardCode: e.target.value }); }} className="min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2 uppercase" autoComplete="off" />
        <Button variant="outline" disabled={busy || !payment.giftCardCode?.trim()} onClick={() => void check()}>{busy ? 'Checking…' : 'Check balance'}</Button>
      </div>
    </label>
    {card ? <p className="text-sm text-muted-foreground">Available {formatINR(Number(card.balance))}{card.guest_name ? ` · ${card.guest_name}` : ''}</p> : null}
    {error || problem ? <p role="alert" className="text-sm text-destructive">{error || problem}</p> : null}
  </div>;
}