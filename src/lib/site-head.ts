/** Page heads for the website's model pages: title, description, canonical and structured data. */
import { APP_ORIGIN } from "./site-config";
import type { PublicPlan } from "./plans";
import type { SiteModel } from "./site-models";

export function modelHead(model: SiteModel, plans: PublicPlan[]) {
  const url = `${APP_ORIGIN}${model.path}`;
  const prices = plans.map((p) => p.price).filter((p): p is number => p !== null);
  const app: Record<string, unknown> = {
    "@type": "SoftwareApplication", name: `${model.name} by XTSY`, applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Windows, macOS, Android, iOS", description: model.seo.description, url,
    publisher: { "@type": "Organization", name: "XTSY Ventures Private Limited", url: "https://xtsy.one" },
  };
  if (prices.length) app["offers"] = { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: plans.length };
  const jsonLd = { "@context": "https://schema.org", "@graph": [app, { "@type": "FAQPage", mainEntity: model.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] };
  return {
    meta: [
      { title: model.seo.title },
      { name: "description", content: model.seo.description },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: model.seo.title },
      { property: "og:description", content: model.seo.description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: `${APP_ORIGIN}/og-xtsy-pos.png` },
      { property: "og:site_name", content: "XTSY POS" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#1F2230" },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
  };
}
