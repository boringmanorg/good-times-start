/**
 * Restaurant POS and the stay products (Hostel, Hotel, Resort POS) are separate apps
 * (owner, 27 Nov 2026): one browser can be signed in to both at once, each with its own
 * session, its own offline data and its own device settings. Which app a tab belongs to is
 * decided once, from the address it opened on, and never changes while the tab lives; moving
 * to the other app reloads the tab (RootComponent). Pure apart from the cached answer; tested.
 *
 * The restaurant keeps every name it had before (session key, database, storage keys), so
 * counters that were signed in stay signed in with their data.
 */
export type AppSpace = "restaurant" | "stay";

/** The app an address belongs to. `?space=stay` (support sign-in links) wins. */
export function spaceOfPath(pathname: string, search = ""): AppSpace {
  const forced = new URLSearchParams(search).get("space");
  if (forced === "stay" || forced === "restaurant") return forced;
  return /^\/(hostel|hotel|resort)(pos)?(\/|$)|^\/stays(\/|$)/.test(pathname) ? "stay" : "restaurant";
}

let space: AppSpace | null = null;

/** This tab's app. On the server (no tab) it is always the restaurant. */
export function appSpace(): AppSpace {
  if (typeof window === "undefined") return "restaurant";
  space ??= spaceOfPath(window.location.pathname, window.location.search);
  return space;
}

/** A browser-storage or database name for this tab's app: the restaurant keeps the bare name. */
export function spaced(name: string, s: AppSpace = appSpace()): string {
  return s === "stay" ? `${name}:stay` : name;
}
