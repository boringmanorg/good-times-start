import { describe, expect, it } from "vitest";
import { DOORS, DOOR_LIST, doorOf, doorPathFor, doorsFor, homeFor, wrongDoorMessage } from "./login-doors";
import { PRODUCTS } from "./products";

describe("one sign-in per POS model", () => {
  it("every product has its own door and path", () => {
    expect(DOOR_LIST.map((d) => d.product).sort()).toEqual(PRODUCTS.map((p) => p.id).sort());
    expect(new Set(DOOR_LIST.map((d) => d.path)).size).toBe(DOOR_LIST.length);
    expect(doorPathFor("restaurant_pos")).toBe("/restaurantpos");
    expect(doorPathFor("hostel_pos")).toBe("/hostelpos");
    expect(doorPathFor("hotel_pos")).toBe("/hotelpos");
    expect(doorPathFor("resort_pos")).toBe("/resortpos");
    expect(doorPathFor("tourism_pos")).toBe("/tourismpos");
    expect(doorOf(undefined)).toBe("restaurant_pos");
    expect(doorOf("nonsense")).toBe("restaurant_pos");
  });
  it("only launched models take sign-ins", () => {
    expect(DOOR_LIST.filter((d) => d.open).map((d) => d.product).sort()).toEqual(["hostel_pos", "restaurant_pos"]);
  });
  it("opens each app on its own home", () => {
    expect(homeFor("hostel_pos", "manager")).toBe("/stays");
    expect(homeFor("hostel_pos", "pos")).toBe("/front-desk");
    expect(homeFor("restaurant_pos", "pos")).toBe("/tables");
    expect(homeFor("restaurant_pos", "waiter")).toBe("/waiter");
    expect(homeFor("restaurant_pos", "manager")).toBe("/dashboard");
  });
  it("stay doors offer no waiter app", () => {
    expect(DOORS.hostel_pos.apps).not.toContain("waiter");
  });
  it("refuses another product's door and names the right one", () => {
    expect(wrongDoorMessage("hostel_pos", ["hostel_pos"])).toBeNull();
    expect(wrongDoorMessage("restaurant_pos", [null])).toBeNull();
    expect(wrongDoorMessage("restaurant_pos", ["hostel_pos"])).toBe("This login is for Hostel POS. Sign in at /hostelpos instead.");
    expect(wrongDoorMessage("hostel_pos", ["restaurant_pos"])).toBe("This login is for Restaurant POS. Sign in at /restaurantpos instead.");
    // Hostel and Hotel are separate products now: a hostel login can't use the hotel door.
    expect(wrongDoorMessage("hotel_pos", ["hostel_pos"])).toMatch(/Hostel POS/);
    expect(doorsFor(["hostel_pos", null]).sort()).toEqual(["hostel_pos", "restaurant_pos"]);
    expect(wrongDoorMessage("hostel_pos", [])).toBeNull();
  });
});
