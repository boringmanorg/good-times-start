import { createFileRoute } from "@tanstack/react-router";
import { isMarketingHost } from "@/lib/site-config";

/** Search engines may crawl the website; staff apps, guest pages and the console stay out of search. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const body = isMarketingHost(url.hostname)
          ? `User-agent: *\nAllow: /\n\nSitemap: https://${url.host}/sitemap.xml\n`
          : // Only the home page (the website) and its files; "/$" outranks "Disallow: /" for the bare home page.
          `User-agent: *\nAllow: /$\nAllow: /assets/\nAllow: /brand/\nAllow: /og-xtsy-pos.png\nDisallow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`;
        return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
