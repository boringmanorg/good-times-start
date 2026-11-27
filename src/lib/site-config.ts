/**
 * The XTSY POS marketing website lives in this same project but answers only on its own
 * domain(s): there, every path shows the website and nothing can reach a sign-in page.
 * Until a domain is connected, the website can be previewed at SITE_PATH on the app's address.
 *
 * To go live: connect the domain to this Lovable project, then add it (with and without www) here.
 */
/*
 * CAREFUL: a host listed here serves ONLY the website — marketingPath() rewrites every other
 * path to the website's home page. www.posbyxtsy.club is deliberately NOT here: it is the app's
 * primary domain and serves the staff apps, the console and every guest QR page as well as the
 * website at "/". Listing it would rewrite /order/… and /book/… to the home page and break every
 * printed QR card. Only add a host here that should show the website and nothing else.
 */
export const MARKETING_HOSTS: string[] = ["xtsypos.test"];

/** Where the website lives inside the app. It is also what the bare main address ("/") shows. */
export const SITE_PATH = "/homepage";

/** Staff sign-in (POS Manager, POS Billdesk, Waiter Pro). Never linked from the website. */
/** Restaurant POS sign-in. Every model has its own door (login-doors.ts); /login still opens Restaurant POS. */
export const STAFF_LOGIN_PATH = "/restaurantpos";

/**
 * On the app's own address the bare home page ("/", no query) is the website; "/?table=…" etc. stay
 * the bill screen. Returns the internal path to show, or null to leave the address alone.
 */
export function homeToWebsite(pathname: string, search: string): string | null {
  return pathname === "/" && (search === "" || search === "?") ? SITE_PATH : null;
}

/** The app's own public address (staff apps, guest QR pages, the console). */
export const APP_ORIGIN = "https://www.posbyxtsy.club";

export function isMarketingHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return MARKETING_HOSTS.some((m) => m.toLowerCase() === h);
}

/** Public URL of the website: its own domain once connected, else the preview path. */
export function siteUrl(): string {
  const host = MARKETING_HOSTS.find((h) => !h.startsWith("www.")) ?? MARKETING_HOSTS[0];
  return host && host !== "xtsypos.test" ? `https://${host}/` : `${APP_ORIGIN}/`;
}

/** Paths a marketing host may serve as themselves (files the browser and crawlers need). */
const PASS_THROUGH = /^\/(assets|icons|brand|videos|site|_build|@|node_modules|src)\/|^\/(favicon\.png|robots\.txt|sitemap\.xml|og-xtsy-pos\.png|privacy|terms|refunds|restaurant-pos|hostel-pos|hotel-pos|resort-pos|tourism-pos)$/;

/**
 * On a marketing host, map the requested path into the website. Anything that isn't the website
 * (sign-in, staff apps, console, guest pages) becomes the website's home page.
 */
export function marketingPath(pathname: string): string | null {
  if (PASS_THROUGH.test(pathname)) return null;
  if (pathname === SITE_PATH || pathname.startsWith(`${SITE_PATH}/`)) return null;
  return SITE_PATH;
}
