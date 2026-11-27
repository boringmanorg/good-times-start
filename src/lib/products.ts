/**
 * XTSY products: the POS models the super admin console manages. Restaurant POS is live; the
 * others are planned and listed so the console is laid out for them. Pure, tested in
 * products.test.ts.
 *
 * A restaurant's product lives in restaurants.branding.product; none means Restaurant POS, which
 * is every outlet onboarded before products existed.
 *
 * Console address (hash): #products → #products/<product> → #products/<product>/<restaurant>
 * → #products/<product>/<restaurant>/<section>. The old #restaurants opens Restaurant POS.
 */
export type ProductId = "restaurant_pos" | "hotel_pos" | "resort_pos" | "hostel_pos" | "tourism_pos";

/** "pilot": open for onboarding by XTSY while the first property tries it; not sold on the website yet. */
export interface Product { id: ProductId; name: string; status: "live" | "pilot" | "soon"; blurb: string; models: string }

export const PRODUCTS: Product[] = [
  { id: "restaurant_pos", name: "Restaurant POS", status: "live", blurb: "Billing, KOTs, tables, QR ordering, purchases and the POS Manager, Billdesk and Waiter Pro apps.", models: "Restaurants, fine dine, cafés, cloud kitchens" },
  { id: "hotel_pos", name: "Hotel POS", status: "soon", blurb: "Front desk, rate plans, room service and the restaurant on one folio, with the channel manager.", models: "Hotels, boutique stays, hotel groups" },
  { id: "resort_pos", name: "Resort POS", status: "soon", blurb: "Stays, activities and packages across several outlets on one property.", models: "Resorts, glamping" },
  { id: "hostel_pos", name: "Hostel POS", status: "pilot", blurb: "PMS, channel manager and booking engine in one: beds and rooms, rates, OTA and website bookings, front desk and folios.", models: "Hostels, backpacker stays, homestays" },
  { id: "tourism_pos", name: "Tourism POS", status: "soon", blurb: "Tours, rentals and transfers with bookings, drivers and payments.", models: "Tour operators, rentals" },
];

/** Products with the front desk (PMS by XTSY): onboarding switches `pms` on for the outlet. */
export const STAY_PRODUCTS: ProductId[] = ["hotel_pos", "resort_pos", "hostel_pos"];

export const isProductId = (v: unknown): v is ProductId => PRODUCTS.some((p) => p.id === v);

/**
 * Each POS model has its own plans in the one catalogue, told apart by the plan id's prefix:
 * hostel_* (and the pilot stay_pilot), hotel_*, resort_*, tourism_*. Everything else is a
 * Restaurant POS plan (basic, pro_lite, pro, enterprise and the internal rows).
 */
export const PLAN_PREFIX: Record<ProductId, string> = { restaurant_pos: "", hostel_pos: "hostel_", hotel_pos: "hotel_", resort_pos: "resort_", tourism_pos: "tourism_" };
export function planProduct(planId: string): ProductId {
  if (planId === "stay_pilot" || planId.startsWith("hostel_")) return "hostel_pos";
  if (planId.startsWith("hotel_")) return "hotel_pos";
  if (planId.startsWith("resort_")) return "resort_pos";
  if (planId.startsWith("tourism_")) return "tourism_pos";
  return "restaurant_pos";
}
/** A new plan's id for a model: its prefix plus the name, lower case, 2–24 characters. */
export function newPlanId(product: ProductId, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${PLAN_PREFIX[product]}${slug}`.slice(0, 24).replace(/_+$/, "");
}
export const productById = (id: ProductId): Product => PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0]!;

/** The product an outlet runs on: its own setting, else Restaurant POS. */
export function productOf(stored: string | null | undefined): ProductId {
  return isProductId(stored) ? stored : "restaurant_pos";
}

export type Section = "overview" | "subscription" | "users" | "devices" | "integrations" | "channel" | "sandbox" | "activity";
export const SECTIONS: { v: Section; l: string }[] = [
  { v: "overview", l: "Overview" },
  { v: "subscription", l: "Plan & billing" },
  { v: "users", l: "Users" },
  { v: "devices", l: "Devices" },
  { v: "integrations", l: "Swiggy & Zomato" },
  { v: "channel", l: "Channel manager" },
  { v: "sandbox", l: "Sandbox" },
  { v: "activity", l: "Activity" },
];
const isSection = (v: unknown): v is Section => SECTIONS.some((s) => s.v === v);

/** An outlet's console sections follow its product: Swiggy & Zomato for restaurants, the channel manager for stays. */
export function sectionsFor(product: ProductId): { v: Section; l: string }[] {
  const stay = STAY_PRODUCTS.includes(product);
  return SECTIONS.filter((s) => (s.v === "integrations" ? !stay : s.v === "channel" || s.v === "sandbox" ? stay : true));
}

export type ConsoleTab = "overview" | "products" | "activity" | "plans" | "infra" | "seo";
const TABS: ConsoleTab[] = ["overview", "products", "activity", "plans", "infra", "seo"];

export interface ConsoleRoute { tab: ConsoleTab; product?: ProductId; restaurant?: string; section?: Section }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseConsoleHash(hash: string): ConsoleRoute {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  const [first, product, restaurant, section] = parts;
  if (first === "restaurants") return { tab: "products", product: "restaurant_pos" };
  if (!TABS.includes(first as ConsoleTab)) return { tab: "overview" };
  if (first !== "products" || !isProductId(product)) return { tab: first as ConsoleTab };
  if (!restaurant || !UUID.test(restaurant)) return { tab: "products", product };
  const allowed = isSection(section) && sectionsFor(product).some((s) => s.v === section);
  return { tab: "products", product, restaurant: restaurant.toLowerCase(), section: allowed ? section : "overview" };
}

export function consoleHash(r: ConsoleRoute): string {
  if (r.tab !== "products" || !r.product) return `#${r.tab}`;
  if (!r.restaurant) return `#products/${r.product}`;
  return `#products/${r.product}/${r.restaurant}${r.section && r.section !== "overview" ? `/${r.section}` : ""}`;
}

/** Console list search: name, slug, city, or plan name. */
export function restaurantMatches(r: { name: string; slug: string | null; city: string; planName?: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [r.name, r.slug ?? "", r.city, r.planName ?? ""].some((v) => v.toLowerCase().includes(q));
}

export type ListFilter = "all" | "live" | "stopped" | "trial" | "due";
export function filterMatches(r: { live: boolean; status: string | null }, f: ListFilter): boolean {
  if (f === "all") return true;
  if (f === "live") return r.live;
  if (f === "stopped") return !r.live;
  if (f === "trial") return r.status === "trialing";
  return r.status === "past_due";
}
