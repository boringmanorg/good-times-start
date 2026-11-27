/**
 * Each XTSY POS model has its own sign-in page ("door"): Restaurant POS at /login, the stay
 * products (Hostel, Hotel and Resort POS: the PMS with its channel manager) at /hostel/login.
 * A future model adds a door here and a route file. Pure apart from the remembered door; tested
 * in login-doors.test.ts.
 */
import type { AppKind } from "@/lib/staff-login-logic";
import { STAY_PRODUCTS, isProductId, productById, type ProductId } from "@/lib/products";

export type Door = "restaurant" | "stay";
export type DoorPath = "/login" | "/hostel/login";

export interface DoorInfo {
  path: DoorPath;
  name: string;
  /** The apps this door offers, in order. */
  apps: AppKind[];
  appNames: Partial<Record<AppKind, { name: string; for: string }>>;
  pitch: string;
  pitchBody: string;
}

export const DOORS: Record<Door, DoorInfo> = {
  restaurant: {
    path: "/login",
    name: "Restaurant POS",
    apps: ["manager", "pos", "waiter"],
    appNames: {},
    pitch: "Billing your restaurant will love.",
    pitchBody: "POS Manager for the owner, POS Billdesk for the counter, Waiter Pro for the floor. Orders flow between them live, even offline.",
  },
  stay: {
    path: "/hostel/login",
    name: "Hostel POS",
    apps: ["manager", "pos"],
    appNames: {
      manager: { name: "Property Manager", for: "Owner and manager · rates, bookings, reports and the channel manager" },
      pos: { name: "Front Desk", for: "Reception · check-ins, folios and housekeeping" },
    },
    pitch: "Your property, one desk.",
    pitchBody: "Rooms and beds, rates, bookings from every channel and your own website, check-in to check-out, in one place. Keeps working when the Wi-Fi doesn't.",
  },
};

export function doorOf(product: string | null | undefined): Door {
  return isProductId(product) && STAY_PRODUCTS.includes(product as ProductId) ? "stay" : "restaurant";
}

export const doorPathFor = (product: string | null | undefined): DoorPath => DOORS[doorOf(product)].path;

/** Where an app opens for each door. */
export function homeFor(door: Door, app: AppKind): "/dashboard" | "/tables" | "/waiter" | "/stays" | "/front-desk" {
  if (door === "stay") return app === "pos" ? "/front-desk" : "/stays";
  return app === "pos" ? "/tables" : app === "waiter" ? "/waiter" : "/dashboard";
}

/**
 * Which door a person may use, from the products of the outlets they belong to. People with no
 * outlet yet (a brand-new login) may use either; the app explains what's missing.
 */
export function doorsFor(products: (string | null | undefined)[]): Door[] {
  if (products.length === 0) return ["restaurant", "stay"];
  return [...new Set(products.map(doorOf))];
}

/** The message shown when someone signs in at the wrong door; null when the door is right. */
export function wrongDoorMessage(at: Door, products: (string | null | undefined)[]): string | null {
  const ok = doorsFor(products);
  if (ok.includes(at)) return null;
  const right = ok[0] ?? "restaurant";
  const product = products.find((p) => doorOf(p) === right);
  const name = right === "stay" && isProductId(product) ? productById(product).name : DOORS[right].name;
  return `This login is for ${name}. Sign in at ${DOORS[right].path} instead.`;
}

const KEY = "xtsy-door";

/** Remember the door this device signs in at, so signing out comes back to it. */
export function rememberDoor(door: Door): void {
  try { window.localStorage.setItem(KEY, door); } catch { /* private mode: fall back to /login */ }
}

export function signInPath(): DoorPath {
  try { return window.localStorage.getItem(KEY) === "stay" ? DOORS.stay.path : DOORS.restaurant.path; } catch { return DOORS.restaurant.path; }
}
