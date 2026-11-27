/**
 * Which outlet this device is working in.
 *
 * A device holds one outlet's data at a time (IndexedDB is bound to a restaurant id), so
 * switching means: check nothing would be lost, clear the device, remember the new choice and
 * reload. The guards live in `prepareOutletSwitch`; the choice lives here.
 */
import type { Membership } from "./staff";
import { spaced } from "@/lib/app-space";

const KEY = spaced("xtsy-outlet");

/** The outlet this device last chose, if any. */
export function chosenOutlet(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}

export function rememberOutlet(restaurantId: string): void {
  try { window.localStorage.setItem(KEY, restaurantId); } catch { /* storage unavailable */ }
}

export function forgetOutlet(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

/**
 * The membership to work in: the remembered one when the person still belongs to it, else the
 * first. A stale choice (an outlet they were removed from, or another brand's) must never win,
 * or they would be stuck on a screen they can no longer load.
 */
export function pickActive(memberships: Membership[], chosen: string | null): Membership | undefined {
  if (!memberships.length) return undefined;
  return memberships.find((m) => m.restaurantId === chosen) ?? memberships[0];
}

/** Does this person work in more than one outlet? Only then is a switcher worth showing. */
export const hasSeveralOutlets = (memberships: Membership[]): boolean => memberships.length > 1;

/** The outlets to offer, the current one first so the list reads from where you are. */
export function switchTargets(memberships: Membership[], activeId: string | null): Membership[] {
  const here = memberships.filter((m) => m.restaurantId === activeId);
  const rest = memberships.filter((m) => m.restaurantId !== activeId);
  return [...here, ...rest];
}
