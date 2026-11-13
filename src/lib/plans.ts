/**
 * XTSY POS plans: what each subscription includes. Pure data and rules, tested.
 *
 * Prices are per outlet per month. The cloud keeps the live catalogue (plans table) and each restaurant's subscription
 * (accounts). This file is the shared vocabulary, the public price list shown on the
 * website (which never reads the database), and the offline-safe feature checks.
 * No payments happen in the software: XTSY records plans and renewals by hand.
 */

export type PlanId = "basic" | "pro_lite" | "pro" | "enterprise";
export type Feature =
  | "billing" | "menu" | "gst_reports" | "manager_app"
  | "insights" | "purchases" | "vendors" | "loyalty" | "bookings" | "admin_approval"
  | "waiter_app" | "qr_ordering" | "online_ordering" | "marketing"
  | "audit_log" | "multi_outlet";
export type SeatApp = "manager" | "pos" | "waiter";

/** Every feature switch, in the order plans list them. Prices are per outlet. */
export const FEATURES: Feature[] = [
  "billing", "menu", "gst_reports", "manager_app",
  "insights", "purchases", "vendors", "loyalty", "bookings", "admin_approval",
  "waiter_app", "qr_ordering", "online_ordering", "marketing",
  "audit_log", "multi_outlet",
];

export const FEATURE_NAMES: Record<Feature, string> = {
  billing: "Billing, KOTs and tables",
  menu: "Menu management",
  gst_reports: "GST bills and sales reports",
  manager_app: "Dedicated POS Manager mobile app",
  insights: "Sales dashboard and analysis",
  purchases: "Purchases and spend analysis",
  vendors: "Vendor management",
  loyalty: "Guest loyalty programme",
  bookings: "Table reservations",
  admin_approval: "Admin / manager approval codes",
  waiter_app: "Waiter Pro app",
  qr_ordering: "Guest QR ordering",
  online_ordering: "QR takeaway and delivery orders",
  marketing: "Marketing and branding tools",
  audit_log: "Audit logs and full reports",
  multi_outlet: "Several outlets under one brand",
};

/** Features listed on the website (internal switches like multi_outlet stay off the price cards). */
export const PUBLIC_FEATURES: Feature[] = FEATURES.filter((f) => f !== "multi_outlet" && f !== "online_ordering");

export const SEAT_NAMES: Record<SeatApp, string> = { manager: "Admin / Manager", pos: "Billdesk", waiter: "Waiter" };
export const SEAT_APPS: Record<SeatApp, string> = { manager: "POS Manager", pos: "POS Billdesk", waiter: "Waiter Pro" };

export interface PublicPlan {
  id: PlanId;
  name: string;
  /** Rupees per month for one outlet; null = call for a quote. */
  price: number | null;
  tagline: string;
  seats: Record<SeatApp, number | null>;
  features: Feature[];
  highlight?: boolean;
}

const BASIC: Feature[] = ["billing", "menu", "gst_reports", "manager_app"];
const PRO_LITE: Feature[] = [...BASIC, "insights", "purchases", "vendors", "loyalty", "bookings", "admin_approval"];
const PRO: Feature[] = [...PRO_LITE, "waiter_app", "qr_ordering", "online_ordering", "marketing"];

/** The published price list, per outlet (website and defaults). Keep in step with the plans table. */
export const PUBLIC_PLANS: PublicPlan[] = [
  { id: "basic", name: "Basic", price: 149, tagline: "Billing, menu and GST reports for one counter",
    seats: { pos: 1, waiter: 0, manager: 1 }, features: BASIC },
  { id: "pro_lite", name: "Pro Lite", price: 299, tagline: "Adds purchases, vendors, loyalty and table reservations",
    seats: { pos: 4, waiter: 0, manager: 1 }, features: PRO_LITE },
  { id: "pro", name: "Pro", price: 499, tagline: "Adds Waiter Pro, QR ordering and marketing tools", highlight: true,
    seats: { pos: 6, waiter: 3, manager: 2 }, features: PRO },
  { id: "enterprise", name: "Enterprise / Brand", price: 999, tagline: "Everything in Pro, unlimited counters and waiters, audit logs",
    seats: { pos: null, waiter: null, manager: 5 }, features: [...PRO, "audit_log", "multi_outlet"] },
];

/** "₹199 / month", or "Call for quote". */
export function priceText(price: number | null): string {
  return price === null ? "Call for quote" : `₹${price.toLocaleString("en-IN")} / month`;
}

/** "6 Billdesk users", "No Waiter users", "Unlimited Billdesk users". */
export function seatText(app: SeatApp, n: number | null): string {
  const who = SEAT_NAMES[app];
  if (n === null) return `Unlimited ${who} users`;
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
