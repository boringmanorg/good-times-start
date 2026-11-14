import { supabase } from "@/integrations/supabase/client";
import { getDb, resetDevice } from "./db";

/**
 * Get this device ready to work for another outlet. A device holds one outlet's
 * data at a time; it switches only when nothing is waiting to sync and no bill
 * is running, so nothing can be lost. The bill series counter is kept.
 */
export async function prepareOutletSwitch(targetId: string): Promise<string | null> {
  const db = getDb();
  const bound = (await db.meta.get("restaurantId"))?.value;
  if (!bound || bound === targetId) return null;
  const [pending, running] = await Promise.all([db.outbox.count(), db.orders.where("status").equals("held").count()]);
  if (pending > 0) return `${pending} change${pending === 1 ? " hasn't" : "s haven't"} reached the cloud yet. Sync first, then switch.`;
  if (running > 0) return `Settle or cancel the ${running} running bill${running === 1 ? "" : "s"} on this device first.`;
  await resetDevice();
  return null;
}

export async function createOutlet(accountId: string, name: string, city: string, copyFrom: string | null): Promise<string> {
  const { data, error } = await supabase.rpc("create_outlet", { _account: accountId, _name: name, _city: city, ...(copyFrom ? { _copy_from: copyFrom } : {}) });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function pushMenu(fromId: string, toIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("push_menu", { _from: fromId, _to: toIds });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export interface OutletDay {
  restaurant_id: string; day: string; bills: number; net: number; tax: number;
  dine_in: number; takeaway: number; delivery: number; aggregator: number; guest_ordered: number;
}

export async function outletSales(outletIds: string[], from: Date, to: Date): Promise<OutletDay[]> {
  const { data, error } = await supabase.rpc("outlet_sales", { _outlets: outletIds, _from: from.toISOString(), _to: to.toISOString() });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OutletDay[]).map((r) => ({ ...r, bills: Number(r.bills), net: Number(r.net), tax: Number(r.tax), dine_in: Number(r.dine_in), takeaway: Number(r.takeaway), delivery: Number(r.delivery), aggregator: Number(r.aggregator), guest_ordered: Number(r.guest_ordered) }));
}

export interface OutletSpend { restaurant_id: string; day: string; entries: number; spend: number }

/** Approved purchase spend per outlet per day, less linked supplier returns. Pairs with outletSales. */
export async function outletPurchases(outletIds: string[], from: Date, to: Date): Promise<OutletSpend[]> {
  const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "outlet_purchases", { _outlets: outletIds, _from: from.toISOString(), _to: to.toISOString() });
  if (error) throw new Error(error.message);
  return ((data ?? []) as OutletSpend[]).map((r) => ({ ...r, entries: Number(r.entries), spend: Number(r.spend) }));
}

export interface TransferLine { materialId: string; qty: number; unitCost?: number | undefined; name?: string | undefined; unit?: string | undefined }

/**
 * Move stock from the outlet this device is in to another outlet of the same brand. The cloud
 * writes both sides together, so a transfer can never exist on only one end.
 */
export async function transferStock(fromId: string, toId: string, items: TransferLine[], note: string): Promise<string> {
  const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "transfer_stock", { _from: fromId, _to: toId, _items: items, _note: note });
  if (error) throw new Error(error.message);
  return String(data ?? "");
}
