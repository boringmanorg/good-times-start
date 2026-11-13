import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { SITE_PATH, homeToWebsite, isMarketingHost, marketingPath } from "./lib/site-config";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Cloud data (plans, outlets, guest orders) stays fresh for 30 s, so moving between pages doesn't refetch it.
      queries: { staleTime: 30_000, gcTime: 10 * 60_000, retry: 2, refetchOnWindowFocus: true },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start loading a page's code as soon as a finger or pointer heads for its link.
    defaultPreload: "intent",
    defaultPreloadDelay: 30,
    defaultPreloadStaleTime: 0,
    // Never flash a loading state for quick page changes.
    defaultPendingMs: 400,
    defaultPendingMinMs: 0,
    // A short cross-fade between pages where the browser supports it (Chrome, Edge, Safari 18+).
    defaultViewTransition: true,
    // The website is the bare home page ("/"); on a website-only domain every address shows it
    // (no sign-in, no staff screens). Either way its pages read as "/" instead of "/xtsy-pos".
    rewrite: {
      input: ({ url }) => {
        if (!isMarketingHost(url.hostname)) {
          // The app's bare home page is the website too ("/?table=…" stays the bill screen).
          const home = homeToWebsite(url.pathname, url.search);
          if (home === null) return undefined;
          url.pathname = home;
          return url;
        }
        const to = marketingPath(url.pathname);
        if (to === null) return undefined;
        url.pathname = to;
        return url;
      },
      output: ({ url }) => {
        if (!url.pathname.startsWith(SITE_PATH)) return undefined;
        if (!isMarketingHost(url.hostname)) {
          if ((url.pathname !== SITE_PATH && url.pathname !== `${SITE_PATH}/`) || url.search) return undefined;
          url.pathname = "/";
          return url;
        }
        url.pathname = url.pathname.slice(SITE_PATH.length) || "/";
        return url;
      },
    },
  });

  return router;
};
