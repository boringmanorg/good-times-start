import { describe, expect, it } from "vitest";
import { internalPath, toInternal, toPublic } from "./public-urls";

describe("each POS model's app lives under its own folder", () => {
  it("restaurant screens", () => {
    expect(toPublic("/tables", "", "restaurant")).toBe("/restaurant/tables");
    expect(toPublic("/dashboard", "?tab=live", "restaurant")).toBe("/restaurant/dashboard");
    expect(toPublic("/stock", "", "restaurant")).toBe("/restaurant/purchase");
    expect(toPublic("/customers", "", "restaurant")).toBe("/restaurant/guests");
    expect(toInternal("/restaurant/purchase", "")).toEqual({ pathname: "/stock", model: "restaurant" });
    expect(toInternal("/restaurant/waiter", "")?.pathname).toBe("/waiter");
  });
  it("the bill screen is /restaurant/bill; the bare home page stays the website", () => {
    expect(toPublic("/", "?table=t1", "restaurant")).toBe("/restaurant/bill");
    expect(toPublic("/", "", "restaurant")).toBeNull();
    expect(toInternal("/restaurant/bill", "?bill=abc")?.pathname).toBe("/");
    expect(toInternal("/restaurant/bill", "")?.pathname).toBe("/tables");
  });
  it("stay screens under the product's own folder, shared screens follow who is signed in", () => {
    expect(toPublic("/stays", "", "hostel")).toBe("/hostel/dashboard");
    expect(toPublic("/stays/rates", "", "hotel")).toBe("/hotel/rates");
    expect(toPublic("/front-desk", "", "hostel")).toBe("/hostel/front-desk");
    expect(toPublic("/customers", "", "hostel")).toBe("/hostel/guests");
    expect(toPublic("/settings", "", "hostel")).toBe("/hostel/settings");
    expect(toPublic("/settings", "", "restaurant")).toBe("/restaurant/settings");
    expect(toInternal("/hostel/dashboard", "")).toEqual({ pathname: "/stays", model: "hostel" });
    expect(toInternal("/resort/front-desk", "")?.pathname).toBe("/front-desk");
  });
  it("leaves everything else alone: sign-ins, model pages, guest pages, old login addresses", () => {
    for (const p of ["/restaurantpos", "/hostelpos", "/restaurant-pos", "/order/tab-bistro", "/hostel/login", "/restaurant/login", "/restaurant", "/console", "/privacy", "/homepage"]) {
      expect(toInternal(p, ""), p).toBeNull();
      expect(toPublic(p, "", "restaurant"), p).toBeNull();
    }
    expect(internalPath("/tables")).toBe("/tables");
    expect(internalPath("/restaurant/tables")).toBe("/tables");
  });
});

describe("the front desk follows the product too", () => {
  it("restaurant outlets with the desk switched on keep it under /restaurant", () => {
    expect(toPublic("/front-desk", "", "restaurant")).toBe("/restaurant/front-desk");
    expect(toInternal("/restaurant/front-desk", "")?.pathname).toBe("/front-desk");
  });
});
