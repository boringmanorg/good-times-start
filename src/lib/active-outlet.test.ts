import { describe, expect, it } from "vitest";
import type { Membership } from "./staff";
import { hasSeveralOutlets, pickActive, switchTargets } from "./active-outlet";

const m = (id: string, name: string): Membership => ({ restaurantId: id, restaurantName: name, role: "owner" });
const all = [m("a", "TAB Bistro"), m("b", "TAB Express"), m("c", "TAB Cloud")];

describe("which outlet this device works in", () => {
  it("uses the remembered outlet", () => {
    expect(pickActive(all, "b")?.restaurantId).toBe("b");
  });

  it("falls back to the first when nothing is remembered", () => {
    expect(pickActive(all, null)?.restaurantId).toBe("a");
  });

  it("ignores a remembered outlet the person no longer belongs to", () => {
    // Otherwise a removed member is stuck on a screen that can never load.
    expect(pickActive(all, "gone")?.restaurantId).toBe("a");
  });

  it("has nothing to pick when the person belongs nowhere", () => {
    expect(pickActive([], "a")).toBeUndefined();
  });

  it("only offers switching when there is somewhere to switch to", () => {
    expect(hasSeveralOutlets(all)).toBe(true);
    expect(hasSeveralOutlets([m("a", "Only one")])).toBe(false);
    expect(hasSeveralOutlets([])).toBe(false);
  });

  it("lists the outlet you are in first", () => {
    expect(switchTargets(all, "c").map((x) => x.restaurantId)).toEqual(["c", "a", "b"]);
    expect(switchTargets(all, null).map((x) => x.restaurantId)).toEqual(["a", "b", "c"]);
  });
});
