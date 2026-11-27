import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_ORDER_ORIGIN } from "./qr-ordering";
import { orderPageUrl } from "./guest-order-logic";
import { APP_ORIGIN, isMarketingHost, marketingPath, siteUrl } from "./site-config";

const DOMAIN = "https://www.posbyxtsy.club";

describe("the public address printed on QR cards", () => {
  it("is the custom domain, not the deployment address", () => {
    expect(GUEST_ORDER_ORIGIN).toBe(DOMAIN);
    expect(APP_ORIGIN).toBe(DOMAIN);
    expect(siteUrl()).toBe(`${DOMAIN}/`);
    expect(orderPageUrl(GUEST_ORDER_ORIGIN, "tab-bistro-qr")).toBe(`${DOMAIN}/order/tab-bistro-qr`);
  });

  /*
   * The domain serves the whole app — staff apps, console and every guest page — as well as the
   * website at "/". A marketing host serves ONLY the website, so listing it there would rewrite
   * /order/… and /book/… to the home page and break every printed QR card.
   */
  it("is not treated as a website-only host", () => {
    for (const host of ["www.posbyxtsy.club", "posbyxtsy.club"]) {
      expect(isMarketingHost(host)).toBe(false);
    }
    expect(marketingPath("/order/tab-bistro-qr")).toBe("/homepage"); // only ever on a marketing host
  });

  it("is the only public address written anywhere in the source", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { walk(path); continue; }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        // preview-host and previewAuthStorage name lovable hosts on purpose: they detect the editor.
        if (/preview-host|previewAuthStorage|app-install-logic|public-origin/.test(name)) continue;
        const body = readFileSync(path, "utf8");
        if (body.includes("good-times-start.lovable.app")) offenders.push(path);
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders, `these still point at the old address: ${offenders.join(", ")}`).toEqual([]);
  });
});
