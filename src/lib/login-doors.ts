/**
 * Every XTSY POS model has its own sign-in page ("door"), keyed by product:
 *   Restaurant POS  /restaurant/login  (and /login, kept for installed counter apps)
 *   Hostel POS      /hostel/login
 *   Hotel POS       /hotel/login       (coming soon: waitlist, no form)
 *   Resort POS      /resort/login      (coming soon)
 *   Tourism POS     /tourism/login     (coming soon)
 * A login only opens at its own product's door. A new model = an entry here + a route file.
 * Pure apart from the remembered door; tested in login-doors.test.ts.
 */
import type { AppKind } from "@/lib/staff-login-logic";
import { STAY_PRODUCTS, isProductId, productById, type ProductId } from "@/lib/products";

export type Door = ProductId;
export type DoorPath = "/restaurant/login" | "/hostel/login" | "/hotel/login" | "/resort/login" | "/tourism/login";

export interface DoorInfo {
  product: ProductId;
  path: DoorPath;
  name: string;
  /** False for a model that isn't out yet: its door shows the waitlist instead of a form. */
  open: boolean;
  /** The apps this door offers, in order. */
  apps: AppKind[];
  appNames: Partial<Record<AppKind, { name: string; for: string }>>;
  pitch: string;
  pitchBody: string;
  /** The model's page on the website. */
  site: string;
}

const STAY_APPS: Pick<DoorInfo, "apps" | "appNames"> = {
  apps: ["manager", "pos"],
  appNames: {
    manager: { name: "Property Manager", for: "Owner and manager · rates, bookings, reports and the channel manager" },
    pos: { name: "Front Desk", for: "Reception · check-ins, folios and housekeeping" },
  },
};

export const DOORS: Record<Door, DoorInfo> = {
  restaurant_pos: {
    product: "restaurant_pos", path: "/restaurant/login", name: "Restaurant POS", open: true, site: "/restaurant-pos",
    apps: ["manager", "pos", "waiter"], appNames: {},
    pitch: "Billing your restaurant will love.",
    pitchBody: "POS Manager for the owner, POS Billdesk for the counter, Waiter Pro for the floor. Orders flow between them live, even offline.",
  },
  hostel_pos: {
    product: "hostel_pos", path: "/hostel/login", name: "Hostel POS", open: true, site: "/hostel-pos", ...STAY_APPS,
    pitch: "Your property, one desk.",
    pitchBody: "Rooms and beds, rates, bookings from every channel and your own website, check-in to check-out, in one place. Keeps working when the Wi-Fi doesn't.",
  },
  hotel_pos: {
    product: "hotel_pos", path: "/hotel/login", name: "Hotel POS", open: false, site: "/hotel-pos", ...STAY_APPS,
    pitch: "The front desk, the rooms, one folio.",
    pitchBody: "Rate plans, group bookings and several properties under one account. Coming soon.",
  },
  resort_pos: {
    product: "resort_pos", path: "/resort/login", name: "Resort POS", open: false, site: "/resort-pos", ...STAY_APPS,
    pitch: "Stays, activities and packages.",
    pitchBody: "Cottages, tents and villas, activity slots and packages on the guest's one bill. Coming soon.",
  },
  tourism_pos: {
    product: "tourism_pos", path: "/tourism/login", name: "Tourism POS", open: false, site: "/tourism-pos",
    apps: ["manager"], appNames: { manager: { name: "Tour Manager", for: "Departures, seats, drivers and rentals" } },
    pitch: "Tours, seats and drivers.",
    pitchBody: "Departures, vehicles, rentals, advances and GST bills. Coming soon.",
  },
};

export const DOOR_LIST: DoorInfo[] = Object.values(DOORS);

/** The door an outlet's product signs in at; anything unknown is Restaurant POS. */
export function doorOf(product: string | null | undefined): Door {
  return isProductId(product) ? product : "restaurant_pos";
}

export const doorPathFor = (product: string | null | undefined): DoorPath => DOORS[doorOf(product)].path;
export const isStayDoor = (door: Door): boolean => STAY_PRODUCTS.includes(door);

/** Where an app opens for each door. */
export function homeFor(door: Door, app: AppKind): "/dashboard" | "/tables" | "/waiter" | "/stays" | "/front-desk" {
  if (isStayDoor(door)) return app === "pos" ? "/front-desk" : "/stays";
  return app === "pos" ? "/tables" : app === "waiter" ? "/waiter" : "/dashboard";
}

/**
 * Which doors a person may use, from the products of the outlets they belong to. People with no
 * outlet yet (a brand-new login) may use any open door; the app explains what's missing.
 */
export function doorsFor(products: (string | null | undefined)[]): Door[] {
  if (products.length === 0) return DOOR_LIST.filter((d) => d.open).map((d) => d.product);
  return [...new Set(products.map(doorOf))];
}

/** The message shown when someone signs in at the wrong door; null when the door is right. */
export function wrongDoorMessage(at: Door, products: (string | null | undefined)[]): string | null {
  const ok = doorsFor(products);
  if (ok.includes(at)) return null;
  const right = DOORS[ok[0] ?? "restaurant_pos"];
  return `This login is for ${productById(right.product).name}. Sign in at ${right.path} instead.`;
}

const KEY = "xtsy-door";

/** Remember the door this device signs in at, so signing out comes back to it. */
export function rememberDoor(door: Door): void {
  try { window.localStorage.setItem(KEY, door); } catch { /* private mode: fall back to Restaurant POS */ }
}

/** The remembered door's sign-in page. Older devices stored "stay" / "restaurant". */
export function signInPath(): DoorPath {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "stay") return DOORS.hostel_pos.path;
    return DOORS[doorOf(v)].path;
  } catch { return DOORS.restaurant_pos.path; }
}
