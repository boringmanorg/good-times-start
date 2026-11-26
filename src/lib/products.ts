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
  { id: "hotel_pos", name: "Hotel POS", status: "soon", blurb: "Front desk, rooms, check-in and check-out, room bills joined to the restaurant.", models: "Hotels" },
  { id: "resort_pos", name: "Resort POS", status: "soon", blurb: "Stays, activities and packages across several outlets on one property.", models: "Resorts, glamping" },
  { id: "hostel_pos", name: "Hostel POS", status: "pilot", blurb: "Beds and dorms, walk-ins and OTA bookings, café and add-ons on one bill.", models: "Hostels, backpacker stays" },
  { id: "tourism_pos", name: "Tourism POS", status: "soon", blurb: "Tours, rentals and transfers with bookings, drivers and payments.", models: "Tour operators, rentals" },
];

/** Products with the front desk (PMS by XTSY): onboarding switches `pms` on for the outlet. */
export const STAY_PRODUCTS: ProductId[] = ["hotel_pos", "resort_pos", "hostel_pos"];

export const isProductId = (v: unknown): v is ProductId => PRODUCTS.some((p) => p.id === v);
export const productById = (id: ProductId): Product => PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0]!;

/** The product an outlet runs on: its own setting, else Restaurant POS. */
export function productOf(stored: string | null | undefined): ProductId {
  return isProductId(stored) ? stored : "restaurant_pos";
}

export type Section = "overview" | "subscription" | "users" | "devices" | "integrations" | "channel" | "activity";
export const SECTIONS: { v: Section; l: string }[] = [
  { v: "overview", l: "Overview" },
  { v: "subscription", l: "Plan & billing" },
  { v: "users", l: "Users" },
  { v: "devices", l: "Devices" },
  { v: "integrations", l: "Swiggy & Zomato" },
  { v: "channel", l: "Channel manager" },
  { v: "activity", l: "Activity" },
];
const isSection = (v: unknown): v is Section => SECTIONS.some((s) => s.v === v);

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
  return { tab: "products", product, restaurant: restaurant.toLowerCase(), section: isSection(section) ? section : "overview" };
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
