import { createFileRoute } from "@tanstack/react-router";
import { isMarketingHost } from "@/lib/site-config";

/** The website's pages for search engines (only the website: staff screens are never listed). */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const home = isMarketingHost(url.hostname) ? `https://${url.host}/` : `${url.origin}/`;
        const today = new Date().toISOString().slice(0, 10);
        const legal = ['/privacy', '/terms', '/refunds'].map((path) => `${home.replace(/\/$/, '')}${path}`);
        const pages = isMarketingHost(url.hostname) ? [home, ...legal] : [home, ...legal, ...['/tab-bistro', '/tab-bistro/menu', '/tab-bistro/visit', '/tab-bistro/gift-cards'].map(path => `https://posbyxtsy.club${path}`)];
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `  <url><loc>${page}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>`).join('\n')}\n</urlset>\n`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      },
    },
  },
});
