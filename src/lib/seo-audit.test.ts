// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { auditHtml, readPageSpeed } from "./seo-audit";

const good = `<!doctype html><html lang="en"><head><title>XTSY POS — Restaurant billing software for India</title>
<meta name="description" content="Restaurant billing software with KOTs, QR ordering, waiter app and GST billing that keeps working offline. Plans from ₹99 a month.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/">
<meta property="og:title" content="XTSY POS"><meta property="og:description" content="x"><meta property="og:image" content="/og.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication"},{"@type":"FAQPage"}]}</script></head>
<body><h1>Restaurant billing software</h1><h2>a</h2><h2>b</h2><h2>c</h2><a href="#p">p</a><a href="#q">q</a><a href="/x">x</a><a href="#f">f</a>
<img src="a.png" alt="A"><p>${"restaurant POS billing app ".repeat(160)}</p></body></html>`;

describe("SEO audit", () => {
  it("passes a well-made page", () => {
    const r = auditHtml(good, { robots: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml", sitemap: "<urlset><url><loc>https://example.com/</loc></url></urlset>" });
    expect(r.checks.filter((c) => c.level !== "pass").map((c) => c.id)).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.schemaTypes).toEqual(["SoftwareApplication", "FAQPage"]);
    expect(r.keywords.find((k) => k.phrase === "restaurant billing software")).toMatchObject({ inTitle: true, inH1: true, inDescription: true });
  });

  it("flags missing basics and any sign-in link", () => {
    const r = auditHtml(`<html><head></head><body><a href="/auth">Sign in</a><img src="x.png"></body></html>`, { robots: null, sitemap: null });
    const level = (id: string) => r.checks.find((c) => c.id === id)?.level;
    expect(level("title")).toBe("fail");
    expect(level("h1")).toBe("fail");
    expect(level("nologin")).toBe("fail");
    expect(level("alt")).toBe("warn");
    expect(level("sitemap")).toBe("fail");
    expect(r.score).toBeLessThan(40);
  });

  it("reads PageSpeed results", () => {
    expect(readPageSpeed({ lighthouseResult: { categories: { performance: { score: 0.91 }, seo: { score: 1 }, accessibility: { score: 0.95 }, "best-practices": { score: 1 } },
      audits: { "largest-contentful-paint": { displayValue: "1.8 s" } } } })).toMatchObject({ performance: 91, seo: 100, lcp: "1.8 s", cls: "–" });
    expect(readPageSpeed({ error: {} })).toBeNull();
  });
});
