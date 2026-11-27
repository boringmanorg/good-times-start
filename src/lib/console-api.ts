import { consoleClient } from "./console-client";
import type { Feature, SeatApp } from "./plans";
import type { ActivityEvent } from "./activity-logic";
import type { IntegrationLink, IntegrationMode, Platform, SandboxDish, SandboxLine, SandboxOrderRow } from "./aggregator-logic";

/* Super admin console: thin wrappers over the platform_* cloud functions (super admin only). */

const rpc = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await (consoleClient().rpc.bind(consoleClient()) as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }>)(fn, args);
  if (error) throw new Error(/function .* does not exist|schema cache/i.test(error.message) ? `This part of the console needs a cloud update that hasn't been applied yet (${fn}).` : error.message);
  return data;
};

export interface WhoAmI { userId: string | null; email: string | null; superAdmin: boolean }
export interface Overview {
  restaurants: number; accounts: number; liveAccounts: number; byPlan: Record<string, number>; mrr: number; complimentary: number;
  devices: number; devicesOnline: number; devicesToday: number; devicesOverPlan: number; devicesBlocked: number; staffUsers: number;
  records: number; changes1h: number; changes24h: number; bills24h: number; kots24h: number; guestOrders24h: number; bookings7d: number; auditEvents24h: number;
  changesByHour: { hour: string; n: number }[];
  database: { sizeBytes: number; connections: number; activeQueries: number; longestQuerySeconds: number; cacheHitRatio: number | null; commits: number; rollbacks: number;
    deadlocks: number; statsSince: string | null; tables: { name: string; bytes: number; rows: number; dead: number }[] };
  events: { at: string; kind: string; account: string | null; detail: unknown }[];
  at: string;
}
export interface Device { deviceId: string; series: string; description: string; app: string; kind: string; login: string; status: "active" | "blocked" | "over_plan" | "pending"; lastSeen: string | null; firstSeen: string | null; location: string | null }
export interface Account {
  id: string; name: string; planId: string; status: string; paidUntil: string | null; trialEndsAt: string | null; notes: string; complimentary: boolean;
  seatOverrides: Partial<Record<SeatApp, number>>; featureOverrides: Partial<Record<Feature, boolean>>; live: boolean; billingPhone: string; billingEmail: string;
}
export interface RestaurantRow {
  id: string; name: string; slug: string | null; city: string; createdAt: string; launchedAt: string | null;
  account: Account | null; seats: Record<SeatApp, { limit: number | null; used: number }>;
  logins: { login: string; email: string; role: string; active: boolean }[]; devices: Device[];
  lastActivity: string | null; records: number; bills30d: number; changes24h: number; guestOrders7d: number; auditEvents24h: number;
}
export interface PlanRow {
  id: string; name: string; monthly_price: number; billdesk_seats: number | null; waiter_seats: number | null; admin_seats: number | null;
  features: Partial<Record<Feature, boolean>>; active: boolean; quote: boolean; tagline: string; sort: number;
  /** Hostel POS room pricing: rooms in the base price and ₹ per extra room a month. */
  included_rooms?: number | null; extra_room_price?: number | null; max_outlets?: number;
}

export interface PaymentRow { at: string; detail: { amount: number; months: number; method: string; reference: string; from: string | null; until: string; planAtPayment: string } }

/** Record a payment by hand: it extends the paid-until date and makes the account live again. */
export const recordPayment = (p: { account: string; amount: number; months: number; method: string; reference: string }) =>
  rpc<{ paidUntil: string; status: string }>("platform_record_payment", { _account: p.account, _amount: p.amount, _months: p.months, _method: p.method, _reference: p.reference });
export const loadPayments = (account: string) => rpc<PaymentRow[]>("platform_payments", { _account: account });

export const saveRestaurantInfo = (i: { id: string; name: string; slug: string; city: string; billingPhone: string; billingEmail: string }) =>
  rpc<void>("platform_update_restaurant", { _id: i.id, _name: i.name, _slug: i.slug, _city: i.city, _billing_phone: i.billingPhone, _billing_email: i.billingEmail });
export const whoami = () => rpc<WhoAmI>("platform_whoami");
export const loadOverview = () => rpc<Overview>("platform_overview");
export const loadRestaurants = () => rpc<RestaurantRow[]>("platform_restaurants");
export async function loadPlans(): Promise<PlanRow[]> {
  const { data, error } = await (consoleClient().from.bind(consoleClient()) as unknown as (t: string) => { select: (s: string) => { order: (c: string) => Promise<{ data: PlanRow[] | null; error: { message: string } | null }> } })("plans").select("*").order("sort");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export const updateAccount = (a: { id: string; plan: string; status: string; paidUntil: string | null; complimentary: boolean; seats: Partial<Record<SeatApp, number>>; features: Partial<Record<Feature, boolean>>; notes: string }) =>
  rpc<void>("platform_update_account", { _id: a.id, _plan: a.plan, _status: a.status, _paid_until: a.paidUntil, _complimentary: a.complimentary,
    _seat_overrides: a.seats, _feature_overrides: a.features, _notes: a.notes });
/**
 * Save a plan. Room terms are only written when `rooms` is given (stay plans), so a restaurant
 * plan save or a drift restore never wipes them. Changing the price or room terms keeps every
 * current client on the old terms (cloud trigger `plans_keep_customer_prices`).
 */
export const savePlan = (p: { id: string; name: string; monthly: number; billdesk: number | null; waiter: number | null; admin: number | null; features: Partial<Record<Feature, boolean>>; active: boolean; quote: boolean; tagline: string;
  rooms?: { included: number | null; extra: number | null }; maxOutlets?: number }) =>
  rpc<void>("platform_save_plan", { _id: p.id, _name: p.name, _monthly: p.monthly, _billdesk: p.billdesk, _waiter: p.waiter, _admin: p.admin, _features: p.features, _active: p.active, _quote: p.quote, _tagline: p.tagline,
    _set_rooms: !!p.rooms, _included_rooms: p.rooms?.included ?? null, _extra_room_price: p.rooms?.extra ?? null, _max_outlets: p.maxOutlets ?? null });

/** One client's own price (an offer, or the earlier price kept when the plan changed). */
export interface AccountPrice { id: string; customPrice: number | null; includedRooms: number | null; extraRoomPrice: number | null; note: string | null; setAt: string | null }
export async function loadAccountPrices(): Promise<Record<string, AccountPrice>> {
  const { data, error } = await (consoleClient().from.bind(consoleClient()) as unknown as (t: string) => { select: (s: string) => Promise<{ data: { id: string; custom_price: number | null; custom_included_rooms: number | null; custom_extra_room_price: number | null; price_note: string | null; price_set_at: string | null }[] | null; error: { message: string } | null }> })("accounts")
    .select("id, custom_price, custom_included_rooms, custom_extra_room_price, price_note, price_set_at");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.id, { id: r.id, customPrice: r.custom_price, includedRooms: r.custom_included_rooms, extraRoomPrice: r.custom_extra_room_price, note: r.price_note, setAt: r.price_set_at }]));
}
/** Set one client's price (all nulls clears it back to the plan's price). The note is required with a price. */
export const setAccountPrice = (p: { account: string; price: number | null; includedRooms: number | null; extraRoomPrice: number | null; note: string }) =>
  rpc<void>("platform_set_account_price", { _account: p.account, _price: p.price, _included_rooms: p.includedRooms, _extra_room_price: p.extraRoomPrice, _note: p.note });
export const setTerminal = (restaurant: string, device: string, action: "active" | "blocked" | "release") =>
  rpc<string>("platform_set_terminal", { _restaurant: restaurant, _device: device, _action: action });

export interface StaffLogin {
  userId: string; email: string; role: string; displayName: string; internal: "admin" | "billdesk" | "waiter" | null;
  lastSignIn: string | null; createdAt: string | null; signInOff: boolean; devices: number;
}
export const loadStaff = (restaurant: string) => rpc<StaffLogin[]>("platform_staff", { _restaurant: restaurant });

export const bytes = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`;
export const ago = (iso: string | null, now = Date.now()) => {
  if (!iso) return "never";
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

/* Swiggy / Zomato (aggregator-logic.ts): per-restaurant sandbox, set only by the super admin. */
export const loadIntegrations = (restaurant: string) =>
  rpc<{ links: IntegrationLink[]; tests: SandboxOrderRow[] }>("platform_integrations", { _restaurant: restaurant });
export const setIntegration = (restaurant: string, platform: Platform, mode: IntegrationMode, storeId: string) =>
  rpc<void>("platform_set_integration", { _restaurant: restaurant, _platform: platform, _mode: mode, _store_id: storeId });
export const loadSandboxMenu = (restaurant: string) => rpc<SandboxDish[]>("platform_menu_dishes", { _restaurant: restaurant });
export const sendTestOrder = (restaurant: string, platform: Platform, lines: SandboxLine[], customer: string) =>
  rpc<{ code: string; id: string; subtotal: number }>("platform_send_test_order", { _restaurant: restaurant, _platform: platform, _lines: lines, _customer: customer });

/* Activity log (activity-logic.ts): every confirmed console action, newest first. */
export const loadActivity = (restaurant: string | null, before: number | null) =>
  rpc<ActivityEvent[]>("platform_activity", { _restaurant: restaurant, _before: before, _limit: 100 });
