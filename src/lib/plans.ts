/**
 * XTSY POS plans: what each subscription includes. Pure data and rules, tested.
 *
 * The cloud keeps the live catalogue (plans table) and each restaurant's subscription
 * (accounts). This file is the shared vocabulary, the public price list shown on the
 * website (which never reads the database), and the offline-safe feature checks.
 * No payments happen in the software: XTSY records plans and renewals by hand.
 */

export type PlanId = "basic" | "pro_lite" | "pro" | "enterprise";
export type Feature = "billing" | "insights" | "qr_ordering" | "online_ordering" | "bookings" | "waiter_app" | "marketing" | "audit_log" | "multi_outlet";
export type SeatApp = "manager" | "pos" | "waiter";

export const FEATURES: Feature[] = ["billing", "insights", "qr_ordering", "online_ordering", "bookings", "waiter_app", "marketing", "audit_log", "multi_outlet"];

export const FEATURE_NAMES: Record<Feature, string> = {
  billing: "Billing, KOTs and tables",
  insights: "Sales summary and dashboard",
  qr_ordering: "Guest QR ordering",
  online_ordering: "Takeaway and delivery orders",
  bookings: "Table bookings",
  waiter_app: "Waiter Pro app",
  marketing: "WhatsApp marketing",
  audit_log: "Audit log",
  multi_outlet: "Several outlets",
};

export const SEAT_NAMES: Record<SeatApp, string> = { manager: "Admin / Manager", pos: "Billdesk", waiter: "Waiter" };
export const SEAT_APPS: Record<SeatApp, string> = { manager: "POS Manager", pos: "POS Billdesk", waiter: "Waiter Pro" };

export interface PublicPlan {
  id: PlanId;
  name: string;
  /** Rupees per month; null = call for a quote. */
  price: number | null;
  tagline: string;
  seats: Record<SeatApp, number | null>;
  features: Feature[];
  highlight?: boolean;
}

/** The published price list (website and defaults). Keep in step with the plans table. */
export const PUBLIC_PLANS: PublicPlan[] = [
  { id: "basic", name: "Basic", price: 99, tagline: "Billing, KOTs and reports for a single counter",
    seats: { pos: 2, waiter: 0, manager: 1 }, features: ["billing", "insights"] },
  { id: "pro_lite", name: "Pro Lite", price: 199, tagline: "Adds Waiter Pro, QR ordering and table bookings",
    seats: { pos: 5, waiter: 2, manager: 2 }, features: ["billing", "insights", "qr_ordering", "online_ordering", "bookings", "waiter_app"] },
  { id: "pro", name: "Pro", price: 399, tagline: "Everything, for busy restaurants and hotels", highlight: true,
    seats: { pos: 10, waiter: 5, manager: 5 }, features: ["billing", "insights", "qr_ordering", "online_ordering", "bookings", "waiter_app", "marketing", "audit_log"] },
  { id: "enterprise", name: "Enterprise / Brand", price: null, tagline: "Chains and brands: your requirements, fulfilled",
    seats: { pos: null, waiter: null, manager: null }, features: [...FEATURES] },
];

/** "₹199 / month", or "Call for quote". */
export function priceText(price: number | null): string {
  return price === null ? "Call for quote" : `₹${price.toLocaleString("en-IN")} / month`;
}

/** "10 Billdesk users", "No Waiter users", "Unlimited Admin / Manager users". */
export function seatText(app: SeatApp, n: number | null): string {
  const who = SEAT_NAMES[app];
  if (n === null) return `${who} users as you need`;
  if (n === 0) return `No ${who} users`;
  return `${n} ${who} user${n === 1 ? "" : "s"}`;
}

export interface SeatUse { limit: number | null; used: number }
export interface Entitlements {
  plan: string;
  planName: string;
  price: number;
  quote: boolean;
  status: "trialing" | "active" | "past_due" | "suspended" | "cancelled";
  paidUntil: string | null;
  trialEndsAt: string | null;
  live: boolean;
  complimentary: boolean;
  features: Partial<Record<Feature, boolean>>;
  seats: Record<SeatApp, SeatUse>;
  /** Devices waiting for a free seat. */
  waiting: number;
}

/**
 * Whether a feature is on. Unknown (offline before the first check, or an older cloud) means on:
 * a restaurant is never locked out of service because the plan couldn't be read.
 */
export function featureOn(ent: Entitlements | null | undefined, feature: Feature): boolean {
  if (!ent) return true;
  return ent.features[feature] !== false;
}

/** "3 of 10", or "3 (no limit)". */
export function seatUseText(s: SeatUse | undefined): string {
  if (!s) return "";
  return s.limit === null ? `${s.used} in use` : `${s.used} of ${s.limit}`;
}

/** Plan line for the restaurant admin. */
export function subscriptionText(ent: Entitlements, now = Date.now()): string {
  if (ent.complimentary) return `${ent.planName} · complimentary`;
  if (ent.status === "suspended") return `${ent.planName} · paused by XTSY`;
  if (ent.status === "cancelled") return `${ent.planName} · ended`;
  if (ent.paidUntil) {
    const until = Date.parse(ent.paidUntil);
    const date = new Date(until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return until < now ? `${ent.planName} · renewal due since ${date}` : `${ent.planName} · renews ${date}`;
  }
  return `${ent.planName} · active`;
}

/** XTSY's WhatsApp for enquiries and upgrades (same number the admin login uses for codes). */
export const XTSY_WHATSAPP = "918837317070";
export const whatsappLink = (text: string) => `https://wa.me/${XTSY_WHATSAPP}?text=${encodeURIComponent(text)}`;
