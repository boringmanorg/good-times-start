import { describe, expect, it } from "vitest";
import { applyBulkPatch, draftFromItem } from "./menu-logic";
import type { MenuItem } from "./types";

const dish: MenuItem = { id: "a", name: "Pasta", category: "Mains", price: 300, veg: true, gstRate: 5, station: "Main Course", available: true,
  addons: [{ id: "x", name: "Extra Cheese", price: 40 }, { id: "y", name: "Olives", price: 30 }] };
let n = 0;
const mk = () => `id${++n}`;

describe("menu bulk edit", () => {
  it("sets GST to 0%", () => expect(applyBulkPatch(dish, { gstRate: 0 }, mk).gstRate).toBe(0));
  it("new dishes default to 0% GST", () => expect(draftFromItem().gstRate).toBe(0));
  it("changes category and station, blanks keep current", () => {
    const r = applyBulkPatch(dish, { category: "Pasta", station: " " }, mk);
    expect(r.category).toBe("Pasta");
    expect(r.station).toBe("Main Course");
  });
  it("adds a new add-on and reprices an existing one without duplicating", () => {
    const r = applyBulkPatch(dish, { upsertAddons: [{ name: "extra cheese", price: 50 }, { name: "Jalapeno", price: 20 }] }, mk);
    expect(r.addons?.map((a) => [a.name, a.price])).toEqual([["Extra Cheese", 50], ["Olives", 30], ["Jalapeno", 20]]);
  });
  it("removes an add-on by name", () => {
    expect(applyBulkPatch(dish, { removeAddons: ["OLIVES"] }, mk).addons?.map((a) => a.name)).toEqual(["Extra Cheese"]);
  });
});
