import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("public pages skip the staff layer", () => {
  it("website, model pages, policies, guest and restaurant pages are public", () => {
    for (const p of ["/homepage", "/restaurant-pos", "/hostel-pos", "/tourism-pos", "/privacy", "/terms", "/refunds", "/order/tab-bistro", "/book/tab-bistro", "/tab-bistro", "/tab-bistro/menu"]) expect(isPublicPath(p), p).toBe(true);
  });
  it("every staff screen, sign-in and the console keep the staff layer", () => {
    for (const p of ["/", "/tables", "/dashboard", "/waiter", "/kitchen", "/stays", "/front-desk", "/login", "/hostel/login", "/console", "/support", "/orders-pos", "/tab-bistro-x"]) expect(isPublicPath(p), p).toBe(false);
  });
});
