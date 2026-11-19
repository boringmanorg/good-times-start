import { describe, expect, it } from "vitest";
import { billMessage, guestDiscount, guestGetsMessages, guestMatches } from "./customer-logic";
import { waLink } from "./marketing-logic";
import type { Customer, Order } from "./types";

const g = (id: string, name: string, extra: Partial<Customer> = {}): Customer => ({ id, phone: id, name, createdAt: 1, ...extra });
const guests = [g("8837317070", "Amrudheen D", { priority: true }), g("9876500001", "Sam Amrit"), g("9876500002", "Amar"), g("9986593322", "jagdish"), g("8814073007", "Ashish"), g("9876500003", "Pamela")];

describe("guest suggestions on the bill", () => {
  it("one or two letters: names starting with them first, then a word starting with them, then anywhere", () => {
    const visits = new Map([["9876500002", 9]]);
    expect(guestMatches(guests, "am", visits).map((x) => x.name)).toEqual(["Amrudheen D", "Amar", "Sam Amrit", "Pamela"]);
    expect(guestMatches(guests, "A").map((x) => x.name)).toEqual(["Amrudheen D", "Amar", "Ashish", "Sam Amrit", "jagdish", "Pamela"]);
  });
  it("nothing typed shows nothing; phone digits find a guest", () => {
    expect(guestMatches(guests, "  ")).toEqual([]);
    expect(guestMatches(guests, "73007").map((x) => x.name)).toEqual(["Ashish"]);
  });
});

describe("guest discount and messages", () => {
  it("discount is 0–100", () => {
    expect(guestDiscount(undefined)).toBe(0);
    expect(guestDiscount({ discountPct: 12.5 })).toBe(12.5);
    expect(guestDiscount({ discountPct: 140 })).toBe(100);
    expect(guestDiscount({ discountPct: -5 })).toBe(0);
  });
  it("bill messages are on by default, off only when switched off, never without a mobile", () => {
    expect(guestGetsMessages(g("8837317070", "Amrudheen D"))).toBe(true);
    expect(guestGetsMessages(g("8837317070", "Amrudheen D", { billMessages: false }))).toBe(false);
    expect(guestGetsMessages(g("12345", "No phone"))).toBe(false);
  });
  it("test message for Amrudheen D (+91 88373 17070) opens his WhatsApp chat with the bill", () => {
    const order = { billNo: "POS/0051", total: 1163, payments: [{ mode: "upi", amount: 663 }, { mode: "cash", amount: 500 }], settledAt: new Date(2026, 10, 19, 20, 5).getTime(), createdAt: 0,
      customer: { name: "Amrudheen D", phone: "8837317070" }, lines: [{ qty: 2 }, { qty: 1 }] } as unknown as Order;
    const text = billMessage(order, "TAB Bistro by XTSY");
    expect(text).toBe("Hi Amrudheen, thank you for visiting TAB Bistro by XTSY!\n\nBill POS/0051 · 19 Nov 2026\n3 items · ₹1,163 · paid by UPI + cash\n\nSee you again soon.");
    expect(waLink("8837317070", text)).toBe(`https://wa.me/918837317070?text=${encodeURIComponent(text)}`);
  });
});
