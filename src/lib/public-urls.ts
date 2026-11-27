/**
 * Every POS model's app lives under its own folder in the address bar (owner, 27 Nov 2026):
 *
 *   Restaurant POS   /restaurant/bill?table=…, /restaurant/tables, /restaurant/dashboard,
 *                    /restaurant/menu, /restaurant/purchase, /restaurant/guests, /restaurant/reports,
 *                    /restaurant/accounts, /restaurant/settings, /restaurant/waiter …
 *   Hostel POS       /hostel/dashboard, /hostel/rates, /hostel/bookings, /hostel/front-desk,
 *                    /hostel/reports, /hostel/property, /hostel/guests, /hostel/settings
 *   Hotel / Resort   the same screens under /hotel/… and /resort/… when they open
 *
 * Sign-in is /restaurantpos, /hostelpos, /hotelpos, /resortpos, /tourismpos.
 *
 * The screens themselves keep their internal routes (/tables, /stays/rates …), so nothing inside
 * the app changes: the router rewrites the public address to the internal one on the way in and
 * back on the way out (router.tsx). Old addresses (/tables, /dashboard …) still open the screen,
 * so installed counter apps and bookmarks keep working, and the next move shows the new address.
 * Pure; tested in public-urls.test.ts.
 */

export type UrlModel = "restaurant" | "hostel" | "hotel" | "resort";
const STAY_MODELS: UrlModel[] = ["hostel", "hotel", "resort"];

/** Restaurant POS: public name → internal path. */
const RESTAURANT: Record<string, string> = {
  tables: "/tables", dashboard: "/dashboard", menu: "/menu", purchase: "/stock", guests: "/customers",
  reports: "/reports", accounts: "/accounts", brand: "/brand", kitchen: "/kitchen", marketing: "/marketing",
  settings: "/settings", waiter: "/waiter", setup: "/setup", manager: "/manager", "front-desk": "/front-desk",
};
/** Stay products (Hostel, Hotel, Resort POS): public name → internal path. */
const STAY: Record<string, string> = {
  dashboard: "/stays", rates: "/stays/rates", bookings: "/stays/bookings", reports: "/stays/reports",
  property: "/stays/property", "front-desk": "/front-desk", guests: "/customers", settings: "/settings",
};
const invert = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const RESTAURANT_OUT = invert(RESTAURANT);
const STAY_OUT = invert(STAY);
/** Screens both kinds of app use: which folder they show under depends on who is signed in. */
const SHARED = new Set(["/customers", "/settings", "/front-desk"]);

/** Which product's folder shared screens (guests, settings) show under. Set at sign-in and from the address. */
let current: UrlModel = "restaurant";
export function setUrlModel(model: UrlModel): void { current = model; }
export function urlModel(): UrlModel { return current; }
export function urlModelOf(product: string | null | undefined): UrlModel {
  return product === "hostel_pos" ? "hostel" : product === "hotel_pos" ? "hotel" : product === "resort_pos" ? "resort" : "restaurant";
}

const isBill = (search: string) => /[?&](table|bill)=/.test(search);

/**
 * Public address → internal path, or null to leave it alone. "/restaurant/bill" is the bill screen
 * (internally "/" with ?table= or ?bill=); with neither it opens Tables.
 */
export function toInternal(pathname: string, search: string): { pathname: string; model: UrlModel } | null {
  const m = /^\/(restaurant|hostel|hotel|resort)(\/[^/]+)?(\/.*)?$/.exec(pathname);
  if (!m) return null;
  const model = m[1] as UrlModel;
  const name = (m[2] ?? "").slice(1);
  const rest = m[3] ?? "";
  if (!name) return null; // "/restaurant" alone is nothing (the model pages are /restaurant-pos …)
  if (model === "restaurant") {
    if (name === "bill") return { pathname: isBill(search) ? "/" : "/tables", model };
    const to = RESTAURANT[name];
    return to ? { pathname: `${to}${rest}`, model } : null;
  }
  const to = STAY[name];
  return to ? { pathname: `${to}${rest}`, model } : null;
}

/** Internal path → public address, or null to leave it alone. */
export function toPublic(pathname: string, search: string, model: UrlModel = current): string | null {
  if (pathname === "/") return isBill(search) ? "/restaurant/bill" : null;
  const stay = STAY_MODELS.includes(model);
  const p = pathname.replace(/\/$/, "") || "/";
  if (SHARED.has(p)) return `/${model}/${(stay ? STAY_OUT : RESTAURANT_OUT)[p]}`;
  if (STAY_OUT[p]) return `/${stay ? model : "hostel"}/${STAY_OUT[p]}`;
  if (RESTAURANT_OUT[p]) return `/restaurant/${RESTAURANT_OUT[p]}`;
  return null;
}

/** The internal path of any address, public or old ("/restaurant/waiter" → "/waiter"). */
export function internalPath(pathname: string, search = ""): string {
  return toInternal(pathname, search)?.pathname ?? pathname;
}
