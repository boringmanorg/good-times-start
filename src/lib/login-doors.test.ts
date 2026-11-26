import { describe, expect, it } from "vitest";
import { DOORS, doorOf, doorPathFor, doorsFor, homeFor, wrongDoorMessage } from "./login-doors";

describe("login doors", () => {
  it("sends stay products to the hostel door and everything else to /login", () => {
    expect(doorOf("hostel_pos")).toBe("stay");
    expect(doorOf("hotel_pos")).toBe("stay");
    expect(doorOf("resort_pos")).toBe("stay");
    expect(doorOf("restaurant_pos")).toBe("restaurant");
    expect(doorOf(undefined)).toBe("restaurant");
    expect(doorOf("nonsense")).toBe("restaurant");
    expect(doorPathFor("hostel_pos")).toBe("/hostel/login");
    expect(doorPathFor(null)).toBe("/login");
  });
  it("opens each app on its own home", () => {
    expect(homeFor("stay", "manager")).toBe("/stays");
    expect(homeFor("stay", "pos")).toBe("/front-desk");
    expect(homeFor("restaurant", "pos")).toBe("/tables");
    expect(homeFor("restaurant", "waiter")).toBe("/waiter");
    expect(homeFor("restaurant", "manager")).toBe("/dashboard");
  });
  it("stay door offers no waiter app", () => {
    expect(DOORS.stay.apps).not.toContain("waiter");
  });
  it("refuses the wrong door and names the right one", () => {
    expect(wrongDoorMessage("stay", ["hostel_pos"])).toBeNull();
    expect(wrongDoorMessage("restaurant", [null])).toBeNull();
    expect(wrongDoorMessage("restaurant", ["hostel_pos"])).toBe("This login is for Hostel & Hotel POS. Sign in at /hostel/login instead.");
    expect(wrongDoorMessage("stay", ["restaurant_pos"])).toBe("This login is for Restaurant POS. Sign in at /login instead.");
    // A person in both kinds of outlet may use either door; a brand-new login with none too.
    expect(doorsFor(["hostel_pos", null]).sort()).toEqual(["restaurant", "stay"]);
    expect(wrongDoorMessage("stay", [])).toBeNull();
  });
});
