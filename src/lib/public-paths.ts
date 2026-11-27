/**
 * Pages for the public (website, model pages, policies, guest QR ordering and booking, the
 * restaurant's own pages). They never need the staff layer — sync, printing, kitchen-ticket
 * watchers, the POS frame — so RootComponent skips loading it there (about 1 MB less script for
 * a website visitor). Paths are the router's internal ones: the home page is SITE_PATH.
 */
import { SITE_PATH } from "./site-config";

const MODEL_PAGE = /^\/(restaurant|hostel|hotel|resort|tourism)-pos\/?$/;

export function isPublicPath(pathname: string): boolean {
  return pathname === SITE_PATH || pathname.startsWith(`${SITE_PATH}/`)
    || MODEL_PAGE.test(pathname)
    || pathname === "/privacy" || pathname === "/terms" || pathname === "/refunds"
    || pathname.startsWith("/order/") || pathname.startsWith("/book/")
    || pathname === "/tab-bistro" || pathname.startsWith("/tab-bistro/");
}
