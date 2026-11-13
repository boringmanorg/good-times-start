import { describe, expect, it } from "vitest";
import { emailProblem, restaurantDomain, suggestEmail, wouldLeaveNoOwner } from "./platform-login-logic";

describe("super admin login rules", () => {
  it("accepts made-up domains and refuses broken addresses", () => {
    expect(emailProblem("billdesk2@tabbistro.pos")).toBeNull();
    expect(emailProblem("Admin@XTSY.POS")).toBeNull();
    expect(emailProblem("waiter@cafe-one.in")).toBeNull();
    expect(emailProblem("")).toMatch(/Enter/);
    expect(emailProblem("billdesk")).toMatch(/domain/);
    expect(emailProblem("bill desk@tab.pos")).not.toBeNull();
    expect(emailProblem("x@nodot")).not.toBeNull();
  });

  it("suggests the next free login on the restaurant's domain", () => {
    expect(suggestEmail("cashier", ["admin@xtsy.pos", "billdesk@xtsy.pos"], "xtsy.pos")).toBe("billdesk2@xtsy.pos");
    expect(suggestEmail("captain", [], "tab.pos")).toBe("waiter@tab.pos");
    expect(suggestEmail("manager", ["manager@tab.pos", "manager2@tab.pos"], "tab.pos")).toBe("manager3@tab.pos");
  });

  it("finds the restaurant's own domain", () => {
    expect(restaurantDomain(["admin@tab.pos", "billdesk@tab.pos", "x@gmail.com"])).toBe("tab.pos");
    expect(restaurantDomain([])).toBe("xtsy.pos");
  });

  it("never leaves a restaurant without an owner who can sign in", () => {
    const staff = [{ userId: "a", role: "owner", signInOff: false }, { userId: "b", role: "cashier", signInOff: false }];
    expect(wouldLeaveNoOwner(staff, { userId: "a", role: "manager" })).toBe(true);
    expect(wouldLeaveNoOwner(staff, { userId: "a", signInOff: true })).toBe(true);
    expect(wouldLeaveNoOwner(staff, { userId: "a", remove: true })).toBe(true);
    expect(wouldLeaveNoOwner(staff, { userId: "b", role: "owner" })).toBe(false);
    expect(wouldLeaveNoOwner([...staff, { userId: "c", role: "owner", signInOff: false }], { userId: "a", remove: true })).toBe(false);
  });
});
