import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMOS, STATUS, faqFor } from "./site-content";
import { PUBLIC_FEATURES, PUBLIC_PLANS } from "./plans";
import { marketingPath } from "./site-config";

describe("website content", () => {
  it("quotes prices from the plan list it is given, never a stale copy", () => {
    const plans = PUBLIC_PLANS.map((p) => ({ ...p, price: p.price === null ? null : p.price + 1 }));
    const answer = faqFor(plans).find((f) => f.q === "Is the price per outlet?")!.a;
    for (const p of plans) if (p.price !== null) expect(answer).toContain(`${p.name} ₹${p.price}`);
    expect(answer).not.toMatch(/₹149|₹299|₹499/);
  });
  it("every demo has its recorded video and poster, small enough for a phone", () => {
    for (const d of DEMOS) {
      const mp4 = `public/videos/${d.id}.mp4`;
      expect(existsSync(mp4), mp4).toBe(true);
      expect(existsSync(`public/videos/${d.id}.jpg`), d.id).toBe(true);
      expect(statSync(mp4).size).toBeLessThan(2_000_000);
    }
  });
  it("lists Swiggy and Zomato as being tested, not live, and keeps them off the price cards", () => {
    expect(STATUS.live.join(" ")).not.toMatch(/swiggy|zomato/i);
    expect(STATUS.testing.map((t) => t.name).join(" ")).toMatch(/Swiggy and Zomato/);
    expect(PUBLIC_FEATURES).toContain("accounting");
    expect(PUBLIC_FEATURES).not.toContain("aggregators");
  });
  it("a website-only domain still serves the policy pages and the videos", () => {
    for (const p of ["/privacy", "/terms", "/refunds", "/videos/billing.mp4"]) expect(marketingPath(p)).toBeNull();
    expect(marketingPath("/login")).toBe("/xtsy-pos");
  });
});

describe("no property names in public copy", () => {
  it("never names the pilot hostel or its location", async () => {
    const mod = await import("./site-content");
    const text = JSON.stringify([mod.SITE_PRODUCTS, mod.STAY_FEATURE_BLOCKS, mod.STATUS, mod.faqFor([]), mod.SITE_DESCRIPTION]);
    expect(text).not.toMatch(/Travellers Hostel|Experience by XTSY|Shillong|Meghalaya/i);
  });
});
