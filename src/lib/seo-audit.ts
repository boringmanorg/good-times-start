/**
 * On-page SEO audit of a rendered HTML page. Pure: give it the HTML (and robots/sitemap text),
 * get back scored checks. Used by the super admin console on the XTSY POS website.
 */

export type CheckLevel = "pass" | "warn" | "fail";
export interface SeoCheck { id: string; label: string; level: CheckLevel; detail: string }
export interface SeoReport {
  score: number;
  checks: SeoCheck[];
  title: string;
  description: string;
  headings: { level: number; text: string }[];
  words: number;
  keywords: { phrase: string; count: number; inTitle: boolean; inH1: boolean; inDescription: boolean }[];
  schemaTypes: string[];
}

/** Phrases restaurant owners in India search for, which the website should rank for. */
export const TARGET_KEYWORDS = [
  "restaurant billing software", "restaurant POS", "billing app", "KOT", "QR ordering", "hotel billing", "GST billing", "waiter app", "India",
];

export function auditHtml(html: string, opts: { robots?: string | null; sitemap?: string | null; url?: string; keywords?: string[] } = {}): SeoReport {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute("content")?.trim() ?? "";
  const title = doc.querySelector("title")?.textContent?.trim() ?? "";
  const description = meta('meta[name="description"]');
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
  const robotsMeta = meta('meta[name="robots"]').toLowerCase();
  const h1s = [...doc.querySelectorAll("h1")].map((h) => h.textContent?.trim() ?? "");
  const headings = [...doc.querySelectorAll("h1, h2, h3")].map((h) => ({ level: Number(h.tagName.slice(1)), text: (h.textContent ?? "").trim().slice(0, 90) }));
  const images = [...doc.querySelectorAll("img")];
  const missingAlt = images.filter((i) => !i.hasAttribute("alt")).length;
  const bodyText = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
  const words = bodyText ? bodyText.split(" ").length : 0;
  const lower = bodyText.toLowerCase();
  const schemaTypes: string[] = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent ?? "") as unknown;
      const collect = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if (typeof o["@type"] === "string") schemaTypes.push(o["@type"]);
          if (Array.isArray(o["@graph"])) collect(o["@graph"]);
        }
      };
      collect(data);
    } catch { /* invalid JSON-LD is reported below */ schemaTypes.push("invalid"); }
  }
  const internalLinks = [...doc.querySelectorAll("a[href]")].filter((a) => (a.getAttribute("href") ?? "").startsWith("/") || (a.getAttribute("href") ?? "").startsWith("#")).length;
  const loginLinks = [...doc.querySelectorAll("a[href]")].filter((a) => /\/(auth|console|login|signin)\b/i.test(a.getAttribute("href") ?? "")).length;

  const checks: SeoCheck[] = [];
  const add = (id: string, label: string, level: CheckLevel, detail: string) => checks.push({ id, label, level, detail });
  add("title", "Title tag", !title ? "fail" : title.length < 30 || title.length > 65 ? "warn" : "pass", title ? `${title.length} characters: "${title}"` : "Missing");
  add("description", "Meta description", !description ? "fail" : description.length < 70 || description.length > 160 ? "warn" : "pass", description ? `${description.length} characters` : "Missing");
  add("h1", "One H1 heading", h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warn", h1s.length === 1 ? `"${h1s[0]}"` : `${h1s.length} H1 headings`);
  add("outline", "Heading outline", headings.filter((h) => h.level === 2).length >= 3 ? "pass" : "warn", `${headings.filter((h) => h.level === 2).length} H2 sections`);
  add("canonical", "Canonical URL", canonical ? "pass" : "warn", canonical || "Missing: add one once the domain is live");
  add("indexable", "Allowed in search", /noindex/.test(robotsMeta) ? "fail" : "pass", robotsMeta || "No robots meta (indexable)");
  add("lang", "Page language", doc.documentElement.getAttribute("lang") ? "pass" : "warn", doc.documentElement.getAttribute("lang") ?? "Missing lang attribute");
  add("viewport", "Mobile viewport", meta('meta[name="viewport"]') ? "pass" : "fail", meta('meta[name="viewport"]') || "Missing");
  add("og", "Social sharing (Open Graph)", meta('meta[property="og:title"]') && meta('meta[property="og:description"]') ? (meta('meta[property="og:image"]') ? "pass" : "warn") : "fail",
    meta('meta[property="og:image"]') ? "Title, description and image set" : "Add og:image for rich previews on WhatsApp and social");
  add("schema", "Structured data (JSON-LD)", schemaTypes.includes("invalid") ? "fail" : schemaTypes.length ? "pass" : "warn", schemaTypes.length ? schemaTypes.join(", ") : "None");
  add("alt", "Image alt text", missingAlt ? "warn" : "pass", images.length ? `${images.length - missingAlt} of ${images.length} images described` : "No images");
  add("content", "Content depth", words >= 600 ? "pass" : words >= 300 ? "warn" : "fail", `${words} words`);
  add("links", "Internal links", internalLinks >= 4 ? "pass" : "warn", `${internalLinks} internal links`);
  add("nologin", "No login on the website", loginLinks ? "fail" : "pass", loginLinks ? `${loginLinks} link(s) to a sign-in page` : "No sign-in links");
  if (opts.robots !== undefined) add("robots", "robots.txt", opts.robots === null ? "fail" : /disallow:\s*\/\s*$/im.test(opts.robots) && !/allow:\s*\/\S/i.test(opts.robots) ? "warn" : "pass",
    opts.robots === null ? "Not found" : /sitemap:/i.test(opts.robots) ? "Found, lists the sitemap" : "Found; add a Sitemap: line");
  if (opts.sitemap !== undefined) add("sitemap", "sitemap.xml", opts.sitemap === null ? "fail" : /<urlset|<sitemapindex/i.test(opts.sitemap) ? "pass" : "warn",
    opts.sitemap === null ? "Not found" : `${(opts.sitemap.match(/<loc>/g) ?? []).length} URL(s)`);

  const weight = { pass: 1, warn: 0.5, fail: 0 } as const;
  const score = Math.round((100 * checks.reduce((s, c) => s + weight[c.level], 0)) / Math.max(1, checks.length));
  const keywords = (opts.keywords ?? TARGET_KEYWORDS).map((phrase) => {
    const p = phrase.toLowerCase();
    return {
      phrase,
      count: lower.split(p).length - 1,
      inTitle: title.toLowerCase().includes(p),
      inH1: h1s.some((h) => h.toLowerCase().includes(p)),
      inDescription: description.toLowerCase().includes(p),
    };
  });
  return { score, checks, title, description, headings, words, keywords, schemaTypes: schemaTypes.filter((t) => t !== "invalid") };
}

/** Google PageSpeed Insights (Lighthouse) for a public URL: performance, SEO and Core Web Vitals. No key needed. */
export function pageSpeedUrl(url: string, strategy: "mobile" | "desktop"): string {
  const q = new URLSearchParams({ url, strategy });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) q.append("category", c);
  return `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q.toString()}`;
}

export interface PageSpeed { performance: number; seo: number; accessibility: number; bestPractices: number; lcp: string; cls: string; tbt: string; fcp: string }
export function readPageSpeed(json: unknown): PageSpeed | null {
  const lh = (json as { lighthouseResult?: { categories?: Record<string, { score: number | null }>; audits?: Record<string, { displayValue?: string }> } })?.lighthouseResult;
  if (!lh?.categories) return null;
  const s = (k: string) => Math.round(100 * (lh.categories?.[k]?.score ?? 0));
  const a = (k: string) => lh.audits?.[k]?.displayValue ?? "–";
  return { performance: s("performance"), seo: s("seo"), accessibility: s("accessibility"), bestPractices: s("best-practices"),
    lcp: a("largest-contentful-paint"), cls: a("cumulative-layout-shift"), tbt: a("total-blocking-time"), fcp: a("first-contentful-paint") };
}
