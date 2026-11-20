import { describe, expect, it } from "vitest";
import { storyOf } from "./audit-story";
import type { AuditEntry } from "./audit-log";

const e = (over: Partial<AuditEntry>): AuditEntry => ({ id: 1, at: "2026-11-19T10:00:00Z", user_id: "u", user_email: "billdesk@xtsy.pos", device_id: "d", kind: "order", record_id: "r", action: "changed", label: "", changes: [], ...over });

describe("audit log in plain words", () => {
  it("tells a settlement as one line with how it was paid", () => {
    const s = storyOf(e({ label: "POS/0002", changes: [
      { field: "status", from: "held", to: "settled" }, { field: "payments", from: [], to: [{ mode: "upi", amount: 663 }, { mode: "cash", amount: 500 }] },
      { field: "total", from: 1163.4, to: 1163 }, { field: "settledAt", from: null, to: 1 }, { field: "numberRequestId", from: null, to: "x" }] }));
    expect(s).toEqual({ title: "Bill POS/0002 settled · ₹1,163", details: ["UPI ₹663 + Cash ₹500"], tone: "money", routine: false });
    expect(storyOf(e({ label: "POS/0003", changes: [{ field: "status", from: "held", to: "settled" }, { field: "payments", from: [], to: [] }] })).details).toEqual(["no payment (NC)"]);
  });
  it("tells opened bills, sent KOTs, cancellations and corrections", () => {
    expect(storyOf(e({ action: "created", changes: [{ field: "*", to: { tableLabel: "Room 2A", lines: [{ name: "Kerala Parotta", qty: 1 }], customer: { name: "Aman" } } }] })))
      .toMatchObject({ title: "Bill opened · Room 2A", details: ["Kerala Parotta ×1", "Guest Aman"], routine: false });
    expect(storyOf(e({ kind: "kot", action: "created", changes: [{ field: "*", to: { kotNo: "KOT/0164", tableLabel: "Room 666", station: "Beverages", lines: [{ name: "Cappuccino", qty: 1 }] } }] })).title)
      .toBe("KOT/0164 sent · Room 666 · Beverages");
    expect(storyOf(e({ label: "POS/0009", changes: [{ field: "status", from: "held", to: "void" }, { field: "voidReason", from: null, to: "Guest left" }] })))
      .toMatchObject({ title: "Bill POS/0009 cancelled", details: ["Reason: Guest left"] });
    expect(storyOf(e({ label: "POS/0002", changes: [{ field: "amendments", from: [], to: [{ reason: "Wrong mode", to: {} }] }, { field: "payments", from: [], to: [{ mode: "cash", amount: 1163 }] }] })))
      .toMatchObject({ title: "Payment corrected on POS/0002", details: ["Now Cash ₹1,163", "Reason: Wrong mode"], tone: "warn" });
  });
  it("marks book-keeping as routine", () => {
    expect(storyOf(e({ kind: "table", label: "D1", changes: [{ field: "runningTotal", from: 280, to: 0 }] })).routine).toBe(true);
    expect(storyOf(e({ kind: "kot", changes: [{ field: "billNo", from: "", to: "POS/0055" }] })).routine).toBe(true);
    expect(storyOf(e({ changes: [{ field: "numberRequestId", from: null, to: "x" }, { field: "kotSubmittedQty", from: {}, to: {} }] })).routine).toBe(true);
    expect(storyOf(e({ kind: "table", label: "D1", changes: [{ field: "seats", from: 4, to: 6 }] })).routine).toBe(false);
  });
  it("shows what changed on a running bill", () => {
    const s = storyOf(e({ changes: [{ field: "discountPct", from: 0, to: 30 }, { field: "discountAmt", from: 0, to: 498.6 }, { field: "customer", from: null, to: { name: "Aman", phone: "79763" } },
      { field: "lines", from: [{ itemId: "a", name: "Dosa", qty: 1 }], to: [{ itemId: "a", name: "Dosa", qty: 2 }] }] }));
    expect(s.details).toEqual(["Discount %: 0 → 30", "Guest: — → Aman 79763", "Items: Dosa 1 → 2"]);
  });
  it("never shows the admin code key", () => {
    const s = storyOf(e({ kind: "settings", label: "TAB", changes: [{ field: "adminCode", from: "OLDSECRET", to: "NEWSECRET" }, { field: "upiApiKey", from: "a", to: "b" }] }));
    expect(JSON.stringify(s)).not.toMatch(/SECRET|"a"|"b"/);
    expect(s.details).toEqual(["Admin code key renewed (all older codes stop working)", "Upi Api Key changed (hidden)"]);
  });
  it("reads menu, guests and purchases", () => {
    expect(storyOf(e({ kind: "menu", label: "Paneer Tikka", changes: [{ field: "price", from: 280, to: 320 }] })).details).toEqual(["Price: ₹280 → ₹320"]);
    expect(storyOf(e({ kind: "stock_entry", label: "#INV9", changes: [{ field: "approval", from: { status: "pending" }, to: { status: "approved" } }] })).title).toBe("Purchase approved: #INV9");
  });
});

describe("plain words seen on the live test outlet", () => {
  const base = { id: "1", at: "2026-11-20T13:13:00Z", user_id: null, user_email: "a@b", device_id: null } as const;
  it("a purchase reads vendor, total and payment, never its id", () => {
    const st = storyOf({ ...base, kind: "stock_entry", record_id: "x", action: "created", label: "da2921f4-b68d-4697-b497-b34f2562fbea",
      changes: [{ field: "*", from: null, to: { type: "purchase", supplierName: "ZZ Test Vendor", items: [{ name: "Test Paneer", qty: 4, unit: "kg", unitCost: 300 }], payments: [{ mode: "credit", amount: 1200 }] } }] } as never);
    expect(st.title).toBe("Purchase from ZZ Test Vendor · ₹1,200");
    expect(st.details.join(" ")).toContain("Test Paneer 4 kg");
    expect(st.details.join(" ")).not.toContain("da2921f4");
  });
  it("a Swiggy order and the first settings save read plainly", () => {
    expect(storyOf({ ...base, kind: "order", record_id: "o", action: "created", label: null, changes: [{ field: "*", from: null, to: { orderType: "swiggy", lines: [] } }] } as never).title).toBe("Swiggy order opened");
    expect(storyOf({ ...base, kind: "settings", record_id: "s", action: "created", label: null, changes: [{ field: "*", from: null, to: "details" }] } as never).title).toBe("Restaurant details saved for the first time");
  });
});
