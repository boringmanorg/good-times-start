import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { getDb } from './db';
import { syncCloudData } from './cloud-sync';
import { baseKey, parseBase, isPushResults } from './record-versions';
import { toSharedPayload } from './sync-core';
import { getDeviceId } from './terminal-actions';
import { giftPaymentProblem } from './gift-card-checkout-logic';
import { normaliseCode, type GiftCard } from './gift-card-logic';
import type { Order } from './types';

export async function lookupCheckoutCard(restaurantId: string, code: string): Promise<GiftCard> {
  if (!navigator.onLine) throw new Error('Connect to the internet to use a gift card');
  const { data: outlet, error: outletError } = await supabase.from('restaurants').select('account_id').eq('id', restaurantId).single();
  if (outletError || !outlet?.account_id) throw new Error('Could not check this outlet');
  const { data, error } = await supabase.from('gift_cards').select('*').eq('account_id', outlet.account_id).eq('code', normaliseCode(code)).maybeSingle();
  if (error) throw new Error('Could not check the gift card balance. Try again');
  if (!data) throw new Error('No gift card with that code in this brand');
  return data as GiftCard;
}

/** No local financial closure until Cloud has committed the bill and debit together. */
export async function commitGiftCardBill(order: Order, restaurantId: string | undefined): Promise<Order> {
  const problem = giftPaymentProblem(order.payments);
  if (problem) throw new Error(problem);
  if (!navigator.onLine || !restaurantId || !order.uid) throw new Error('Connect to the internet to settle a gift card');
  await syncCloudData(restaurantId);
  const db = getDb();
  const payload = toSharedPayload('order', order);
  const base = parseBase((await db.meta.get(baseKey('order', order.uid)))?.value);
  const { data, error } = await supabase.rpc('push_restaurant_records_from', {
    _restaurant_id: restaurantId, _device: await getDeviceId(),
    _units: [{ rows: [{ kind: 'order', record_id: order.uid, payload: payload as Json, deleted: false, base_version: base?.version ?? null }] }],
  });
  const result = isPushResults(data) ? data.find(r => r.kind === 'order' && r.record_id === order.uid) : undefined;
  if (!error && result?.status === 'applied') {
    await db.meta.put({ key: baseKey('order', order.uid), value: JSON.stringify({ version: result.version, payload }) });
    return order;
  }
  // Lost response after commit: read back this exact bill rather than deduct again.
  const { data: saved } = await supabase.from('restaurant_records').select('payload,version,deleted').eq('restaurant_id', restaurantId).eq('kind', 'order').eq('record_id', order.uid).maybeSingle();
  if (saved && !saved.deleted && JSON.stringify(saved.payload) === JSON.stringify(JSON.parse(JSON.stringify(payload)))) {
    await db.meta.put({ key: baseKey('order', order.uid), value: JSON.stringify({ version: saved.version, payload: saved.payload }) });
    return order;
  }
  throw new Error(result?.status === 'error' ? result.message : 'Gift-card settlement was not confirmed. Check Sync and reopen this bill before retrying');
}