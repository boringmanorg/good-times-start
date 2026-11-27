import { notFound } from "@tanstack/react-router";

/**
 * Silent routes (owner, 27 Nov 2026). Every in-app screen, sign-in door, policy page and the TAB
 * Bistro pages is declared as `/<path>/{-$sub}` — the optional segment keeps the address exactly
 * `/<path>`, but keeps the route out of Lovable's page list, which only lists the POS model pages
 * (`/restaurant-pos`, `/hostel-pos`, …) and the home page. `silent("/dashboard")` gives the typed
 * route id to navigate to; the URL is still `/dashboard`.
 */
export type Silent<P extends string> = P extends "/" ? "/" : `${P}/{-$sub}`;

export function silent<P extends string>(path: P): Silent<P> {
  return (path === "/" ? "/" : `${path}/{-$sub}`) as Silent<P>;
}

/**
 * Only the bare address is a page: `/dashboard/anything` is not found, rather than quietly
 * rendering the dashboard. Every silent route passes this as its `params`.
 */
export const SILENT_PARAMS = {
  parse: (raw: { sub?: string | undefined }): { sub?: string } => {
    if (raw.sub !== undefined && raw.sub !== "") throw notFound();
    return {};
  },
  stringify: (): { sub?: string } => ({}),
};
