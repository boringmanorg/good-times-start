import { beforeEach, describe, expect, it, vi } from 'vitest';

const card = { status: 'active', balance: '300', expires_on: null as string | null };
vi.mock('@/integrations/supabase/client', () => {
  const chain = (table: string) => {
    const q = {
      select: () => q, eq: () => q,
      single: async () => ({ data: { account_id: 'acc' }, error: null }),
      maybeSingle: async () => ({ data: table === 'gift_cards' ? (card.status === 'missing' ? null : card) : null, error: null }),
    };
    return q;
  };
  return { supabase: { from: chain, rpc: vi.fn() } };
});
vi.mock('./db', () => ({ getDb: () => ({}) }));
vi.mock('./cloud-sync', () => ({ syncCloudData: vi.fn() }));
vi.mock('./terminal-actions', () => ({ getDeviceId: async () => 'dev' }));

const { giftCardCheckBeforeNumbering } = await import('./gift-card-checkout');

describe('gift card is checked before the bill takes a number', () => {
  beforeEach(() => { card.status = 'active'; card.balance = '300'; card.expires_on = null; vi.stubGlobal('navigator', { onLine: true }); });

  it('lets a non-gift bill through without a lookup', async () => {
    expect(await giftCardCheckBeforeNumbering([{ mode: 'cash', amount: 500 }], 'r1')).toBeNull();
  });
  it('passes a card with enough balance', async () => {
    expect(await giftCardCheckBeforeNumbering([{ mode: 'gift_card', amount: 300, giftCardCode: 'GCAB' }, { mode: 'cash', amount: 200 }], 'r1')).toBeNull();
  });
  it('refuses more than the balance', async () => {
    expect(await giftCardCheckBeforeNumbering([{ mode: 'gift_card', amount: 301, giftCardCode: 'GCAB' }], 'r1')).toMatch(/Only ₹300 left/);
  });
  it('refuses a cancelled card', async () => {
    card.status = 'void';
    expect(await giftCardCheckBeforeNumbering([{ mode: 'gift_card', amount: 100, giftCardCode: 'GCAB' }], 'r1')).toBe('This gift card has been cancelled');
  });
  it('refuses an unknown code', async () => {
    card.status = 'missing';
    expect(await giftCardCheckBeforeNumbering([{ mode: 'gift_card', amount: 100, giftCardCode: 'NOPE' }], 'r1')).toBe('No gift card with that code in this brand');
  });
  it('refuses when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(await giftCardCheckBeforeNumbering([{ mode: 'gift_card', amount: 100, giftCardCode: 'GCAB' }], 'r1')).toBe('Connect to the internet to use a gift card');
  });
  it('refuses a missing code before any lookup', async () => {
    expect(await giftCardCheckBeforeNumbering([{ mode: 'gift_card', amount: 100 }], 'r1')).toBe('Enter the gift card code');
  });
});
