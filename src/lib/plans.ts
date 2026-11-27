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
  | "recipes" | "gift_cards" | "feedback" | "kds" | "accounting"
  | "audit_log" | "multi_outlet" | "aggregators" | "pms"
  // Stay products only (Hostel/Hotel/Resort POS): each POS model has its own feature set.
  | "booking_engine" | "channel_manager" | "rate_suggestions" | "multi_property" | "restaurant_link";
export type SeatApp = "manager" | "pos" | "waiter";

/** Every feature switch, in the order plans list them. Prices are per outlet. */
export const FEATURES: Feature[] = [
  "billing", "menu", "gst_reports", "manager_app", "insights",
  "purchases", "vendors", "recipes", "loyalty", "bookings", "admin_approval", "aggregators",
  "waiter_app", "qr_ordering", "online_ordering", "marketing", "gift_cards", "feedback",
  "kds", "accounting", "audit_log", "multi_outlet", "pms",
  "booking_engine", "channel_manager", "rate_suggestions", "multi_property", "restaurant_link",
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
  recipes: "Recipe management and food costing",
  gift_cards: "Gift cards",
  feedback: "Guest feedback after a QR order",
  kds: "Kitchen display screen",
  accounting: "Accounting and restaurant bookkeeping",
  audit_log: "Audit logs and full reports",
  aggregators: "Swiggy and Zomato orders on the POS",
  pms: "Front desk: rooms, beds and stays (PMS by XTSY)",
  multi_outlet: "Several outlets under one brand",  // the Brand screen: sales together, add an outlet, push the menu
  booking_engine: "Booking engine for your own website",
  channel_manager: "Channel manager (booking sites through ZimmerStack)",
  rate_suggestions: "Smart rate suggestions",
  multi_property: "Several properties under one account",
  restaurant_link: "Restaurant POS link: room bills and guests synced with your café",
};

/**
 * Each product has its own feature set. Restaurant POS never shows the PMS switch; the stay
 * products (Hostel, Hotel and Resort POS) never show Swiggy & Zomato, Waiter Pro, the kitchen
 * screen, recipes, table reservations, gift cards or delivery: none of that applies to a
 * property. Stay plans are the `stay_` rows in the catalogue.
 */
export const STAY_FEATURES: Feature[] = [
  "pms", "gst_reports", "manager_app", "insights", "booking_engine",
  "channel_manager", "rate_suggestions", "loyalty", "admin_approval", "audit_log",
  "purchases", "vendors", "marketing", "feedback", "accounting", "multi_property",
  "restaurant_link",
];
/** Features that exist only in the stay products; Restaurant POS never shows them. */
export const STAY_ONLY: Feature[] = ["pms", "booking_engine", "channel_manager", "rate_suggestions", "multi_property", "restaurant_link"];
export const RESTAURANT_FEATURES: Feature[] = FEATURES.filter((f) => !STAY_ONLY.includes(f));

/**
 * Where a stay feature stands, shown beside it on price cards and in the console. Never call a
 * feature live before it ships (owner's rule): the channel manager and booking engine are being
 * connected; the rest have no Hostel POS screen yet.
 */
export const STAY_FEATURE_STATE: Partial<Record<Feature, "Rolling out" | "Coming" | "Add-on · coming">> = {
  booking_engine: "Rolling out",
  channel_manager: "Rolling out",
  multi_property: "Coming",
  purchases: "Coming",
  vendors: "Coming",
  accounting: "Coming",
  marketing: "Coming",
  restaurant_link: "Add-on · coming",
};

/** Add-ons: sold on top of any plan of that product, switched on per property by XTSY. */
export const STAY_ADDONS: Feature[] = ["restaurant_link"];
export const featuresFor = (stay: boolean): Feature[] => (stay ? STAY_FEATURES : RESTAURANT_FEATURES);

const STAY_NAMES: Partial<Record<Feature, string>> = {
  pms: "PMS: rooms and beds, rates, bookings and front desk",
  gst_reports: "GST folios and reports",
  manager_app: "Property Manager app",
  insights: "Dashboard, occupancy and rate suggestions",
  loyalty: "Returning-guest loyalty",
  feedback: "Guest feedback",
  accounting: "Accounting and bookkeeping",
};
export const featureName = (f: Feature, stay: boolean): string => (stay ? STAY_NAMES[f] : undefined) ?? FEATURE_NAMES[f];

/** Stay plans (Hostel, Hotel and Resort POS): the pilot row and every hostel_/hotel_/resort_ row. */
export const isStayPlan = (id: string): boolean => /^(stay|hostel|hotel|resort)_/.test(id);

/** What a new plan starts with in the console, per kind of product. */
export const STARTER_FEATURES: Record<"restaurant" | "stay" | "tourism", Feature[]> = {
  restaurant: ["billing", "menu", "gst_reports", "manager_app", "insights"],
  stay: ["pms", "gst_reports", "manager_app", "insights"],
  tourism: ["billing", "gst_reports", "manager_app", "insights"],
};

/** Features listed on the website (internal switches like multi_outlet stay off the price cards). */
/**
 * Features listed on the website and on the in-app plan screen.
 *
 * Left out: online_ordering is an internal switch; kds is turned on per restaurant by XTSY
 * rather than sold with a plan. A plan must not advertise what it cannot do, so a feature stays
 * off this list until it ships.
 *
 * multi_outlet is listed: the Brand screen makes it real (sales across outlets, add an outlet,
 * push the menu), so it is the headline reason to take Enterprise / Brand.
 */
// aggregators: only the sandbox exists until Swiggy/Zomato partner keys are in place, so it is not sold yet.
// accounting shipped (Accounts screen: profit and loss, expenses, day book, Pay later), so it is listed again.
// pms: the front desk is switched on per property by XTSY while Hostel POS is piloted.
const NOT_ON_PRICE_CARDS: Feature[] = ["online_ordering", "kds", "aggregators", "pms"];
export const PUBLIC_FEATURES: Feature[] = FEATURES.filter((f) => !NOT_ON_PRICE_CARDS.includes(f));

export const SEAT_NAMES: Record<SeatApp, string> = { manager: "Admin / Manager", pos: "Billdesk", waiter: "Waiter" };
export const SEAT_APPS: Record<SeatApp, string> = { manager: "POS Manager", pos: "POS Billdesk", waiter: "Waiter Pro" };

/**
 * Each POS model has its own apps, so its own device seats. Restaurant POS: POS Manager, POS
 * Billdesk, Waiter Pro. Stay products (Hostel/Hotel/Resort POS): Property Manager and Front Desk,
 * no waiter. Tourism POS: Tour Manager and Booking desk. The catalogue keeps one set of columns
 * (admin_seats = the manager app, billdesk_seats = the counter/desk app, waiter_seats = Waiter Pro).
 */
export type SeatModel = "restaurant" | "stay" | "tourism";
export const seatModelOf = (product: string | null | undefined): SeatModel =>
  product === "hostel_pos" || product === "hotel_pos" || product === "resort_pos" ? "stay" : product === "tourism_pos" ? "tourism" : "restaurant";
export const SEAT_APPS_BY_MODEL: Record<SeatModel, Partial<Record<SeatApp, string>>> = {
  restaurant: SEAT_APPS,
  stay: { pos: "Front Desk", manager: "Property Manager" },
  tourism: { pos: "Booking desk", manager: "Tour Manager" },
};
/** The seat apps a model has, in display order, with their names. */
export const seatAppsFor = (product: string | null | undefined): [SeatApp, string][] =>
  (["pos", "waiter", "manager"] as SeatApp[]).flatMap((a) => { const n = SEAT_APPS_BY_MODEL[seatModelOf(product)][a]; return n ? [[a, n] as [SeatApp, string]] : []; });

export interface PublicPlan {
  id: PlanId;
  name: string;
  /** Rupees per month for one outlet; null = call for a quote. */
  price: number | null;
  tagline: string;
  seats: Record<SeatApp, number | null>;
  features: Feature[];
  highlight?: boolean;
  /** Hostel POS: rooms in the base price per property (null = no room limit) and ₹ a month per room above it. */
  includedRooms?: number | null;
  extraRoomPrice?: number | null;
  /** How many properties (or outlets) one subscription covers at this price. */
  maxProperties?: number;
}

/**
 * A stay plan's monthly price for a property with this many rooms: the base price covers
 * `includedRooms`, each room above it adds `extraRoomPrice`. Plans without a room limit are flat.
 */
export function stayPlanTotal(plan: Pick<PublicPlan, "price" | "includedRooms" | "extraRoomPrice">, rooms: number): number | null {
  if (plan.price === null) return null;
  const included = plan.includedRooms ?? null;
  if (included === null || !plan.extraRoomPrice) return plan.price;
  return plan.price + Math.max(0, Math.floor(rooms) - included) * plan.extraRoomPrice;
}

/** "Up to 8 rooms · ₹300 a month per extra room", "Up to 5 properties", or "". */
export function roomPriceText(plan: Pick<PublicPlan, "includedRooms" | "extraRoomPrice" | "maxProperties">): string {
  if (plan.includedRooms != null) return `Up to ${plan.includedRooms} rooms${plan.extraRoomPrice ? ` · ₹${plan.extraRoomPrice.toLocaleString("en-IN")} a month per extra room` : ""}`;
  if ((plan.maxProperties ?? 1) > 1) return `Up to ${plan.maxProperties} properties`;
  return "";
}

const BASIC: Feature[] = ["billing", "menu", "gst_reports", "manager_app", "insights"];
const PRO_LITE: Feature[] = [...BASIC, "purchases", "vendors", "recipes", "loyalty", "bookings", "admin_approval", "aggregators"];
const PRO: Feature[] = [...PRO_LITE, "waiter_app", "qr_ordering", "online_ordering", "marketing", "gift_cards", "feedback"];

/**
 * Standby copy of the price list. The website and the in-app plan screen read the cloud
 * catalogue (see public-plans.ts); this is only what they fall back to when that read fails,
 * so keep it in step with the plans table but never treat it as the published price.
 */
export const PUBLIC_PLANS: PublicPlan[] = [
  { id: "basic", name: "Basic", price: 449, tagline: "Billing, menu, GST reports and your sales dashboard",
    seats: { pos: 1, waiter: 0, manager: 1 }, features: BASIC },
  { id: "pro_lite", name: "Pro Lite", price: 899, tagline: "Adds purchases, vendors, recipe costing, loyalty and reservations",
    seats: { pos: 3, waiter: 0, manager: 1 }, features: PRO_LITE },
  { id: "pro", name: "Pro", price: 1299, tagline: "Adds Waiter Pro, QR ordering, gift cards, guest feedback and marketing", highlight: true,
    seats: { pos: 6, waiter: 2, manager: 2 }, features: PRO },
  { id: "enterprise", name: "Enterprise / Brand", price: 1999, tagline: "Everything in Pro, unlimited counters and waiters, several outlets under one brand, audit logs",
    seats: { pos: null, waiter: null, manager: 4 }, features: [...PRO, "accounting", "audit_log", "multi_outlet"] },
];

/**
 * Hostel POS plans (owner, 27 Nov 2026: Essential ₹2,299 up to 8 rooms and Connect ₹2,899 up to 15
 * rooms, one property each, ₹300 a month per extra room; Group ₹7,999 for up to 5 properties; first
 * benchmarked, benchmarked against eZee,
 * Stayflexi, Aiosell and Djubo). The cloud `hostel_*` rows are the truth; this is the ladder the
 * console's drift check compares them with. Restaurant link is an add-on, on no plan.
 */
const HOSTEL_ESSENTIAL: Feature[] = ["pms", "gst_reports", "manager_app", "insights", "booking_engine"];
const HOSTEL_CONNECT: Feature[] = [...HOSTEL_ESSENTIAL, "channel_manager", "rate_suggestions", "loyalty", "admin_approval", "audit_log"];
const HOSTEL_GROUP: Feature[] = [...HOSTEL_CONNECT, "multi_property", "accounting", "purchases", "vendors"];
export const HOSTEL_PLANS: PublicPlan[] = [
  { id: "hostel_essential" as PlanId, name: "Essential", price: 2299, tagline: "PMS and your own booking engine, up to 8 rooms",
    seats: { pos: 2, waiter: 0, manager: 1 }, features: HOSTEL_ESSENTIAL, includedRooms: 8, extraRoomPrice: 300, maxProperties: 1 },
  { id: "hostel_connect" as PlanId, name: "Connect", price: 2899, tagline: "Adds the channel manager and smart rates, up to 15 rooms", highlight: true,
    seats: { pos: 4, waiter: 0, manager: 2 }, features: HOSTEL_CONNECT, includedRooms: 15, extraRoomPrice: 300, maxProperties: 1 },
  // Group: one price for up to 5 properties; Property Manager seats count per property (2 each).
  { id: "hostel_group" as PlanId, name: "Group", price: 7999, tagline: "Up to 5 properties, accounts and purchases",
    seats: { pos: null, waiter: 0, manager: 2 }, features: HOSTEL_GROUP, includedRooms: null, extraRoomPrice: null, maxProperties: 5 },
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
 * Features that fail CLOSED: unknown means off. Everything else fails open, so a restaurant is never
 * locked out of billing because the plan couldn't be read. These two are different: the kitchen
 * screen is switched on per restaurant by XTSY and is not sold with a plan, and accounting belongs
 * to Enterprise / Brand alone — neither should appear by itself on a cloud that hasn't been updated.
 */
export const DEFAULT_OFF: Feature[] = ["kds", "accounting", "pms", "booking_engine", "channel_manager", "multi_property", "restaurant_link"];

/**
 * Whether a feature is on. Unknown (offline before the first check, or an older cloud) means on,
 * except for DEFAULT_OFF features: a restaurant is never locked out of service because the plan
 * couldn't be read, but a feature XTSY has to switch on never switches itself on.
 */
export function featureOn(ent: Entitlements | null | undefined, feature: Feature): boolean {
  const failsClosed = DEFAULT_OFF.includes(feature);
  if (!ent) return !failsClosed;
  const on = ent.features[feature];
  return on === undefined ? !failsClosed : on;
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
