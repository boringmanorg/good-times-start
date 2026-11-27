import { describe, expect, it } from "vitest";
import { spaced, spaceOfPath } from "./app-space";

describe("Restaurant POS and Hostel POS are separate apps", () => {
  it("each address belongs to one app", () => {
    for (const p of ["/hostelpos", "/hotelpos", "/resortpos", "/hostel/dashboard", "/hostel/guests", "/resort/rates", "/stays", "/stays/rates", "/hostel/login"]) expect(spaceOfPath(p), p).toBe("stay");
    for (const p of ["/", "/restaurantpos", "/restaurant/tables", "/restaurant/front-desk", "/tables", "/login", "/console", "/support", "/order/tab-bistro"]) expect(spaceOfPath(p), p).toBe("restaurant");
    expect(spaceOfPath("/support", "?space=stay")).toBe("stay");
  });
  it("the restaurant keeps its old names, the stay app gets its own", () => {
    expect(spaced("restro-pos", "restaurant")).toBe("restro-pos");
    expect(spaced("restro-pos", "stay")).toBe("restro-pos:stay");
  });
});
