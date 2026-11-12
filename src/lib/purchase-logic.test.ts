import { describe, expect, it } from "vitest";
import { canReturnPurchase, purchaseItemSummary, validatePurchaseReturn } from "./purchase-logic";
import type { StockEntry } from "./types";

const purchase: StockEntry = { id: "p1", type: "purchase", at: 1000000, items: [{ materialId: "rice", qty: 10, unitCost: 80 }] };
describe("supplier purchase rules", () => {
  it("permits returns through 48 hours and refuses the next millisecond", () => {
    expect(canReturnPurchase(purchase, purchase.at + 48 * 3600000)).toBe(true);
    expect(canReturnPurchase(purchase, purchase.at + 48 * 3600000 + 1)).toBe(false);
    expect(() => validatePurchaseReturn(purchase, [], [{ materialId: "rice", qty: -1 }], purchase.at + 48 * 3600000 + 1)).toThrow(/48 hours/);
  });
  it("limits returns to the unreturned purchased quantity", () => {
    const returned: StockEntry = { id: "r1", type: "return", purchaseId: "p1", at: purchase.at, items: [{ materialId: "rice", qty: -7 }] };
    expect(() => validatePurchaseReturn(purchase, [returned], [{ materialId: "rice", qty: -4 }], purchase.at)).toThrow(/remaining/);
    expect(() => validatePurchaseReturn(purchase, [returned], [{ materialId: "rice", qty: -3 }], purchase.at)).not.toThrow();
  });
  it("keeps standard prices separate from latest purchase price and quantity", () => {
    const material = { id: "rice", name: "Rice", unit: "kg" as const, lowStockLevel: 0, costPerUnit: 75 };
    const later = { ...purchase, id: "p2", at: purchase.at + 3 * 86400000, items: [{ materialId: "rice", qty: 5, unitCost: 90 }] };
    expect(purchaseItemSummary(material, [purchase, later])).toMatchObject({ count: 2, lastQty: 5, lastPrice: 90, averageDays: 3 });
    expect(material.costPerUnit).toBe(75);
    expect(purchaseItemSummary(material, [])).toMatchObject({ count: 0, lastQty: undefined, lastPrice: undefined });
  });
});
import { entryAmount, itemPurchaseLines, itemTotals, supplierHistories } from "./purchase-logic";
describe("purchase history views", () => {
  const day = (d: number, h = 10) => new Date(2026, 10, d, h).getTime();
  const entries = [
    { id: "p1", type: "purchase" as const, at: day(8), supplierId: "s1", supplierName: "Lyngdoh Traders", reference: "INV-1", items: [{ materialId: "rice", qty: 10, unitCost: 100 }, { materialId: "dal", qty: 2, unitCost: 120 }] },
    { id: "p2", type: "purchase" as const, at: day(9, 9), supplierId: "s1", supplierName: "Lyngdoh Traders", items: [{ materialId: "rice", qty: 5, unitCost: 110 }] },
    { id: "r1", type: "return" as const, at: day(9, 12), purchaseId: "p2", items: [{ materialId: "rice", qty: -1, unitCost: 110 }] },
    { id: "p3", type: "purchase" as const, at: day(9, 15), items: [{ materialId: "dal", qty: 1, unitCost: 130 }] },
  ];
  const suppliers = [{ id: "s1", name: "Lyngdoh Traders" }];
  it("lists an item's purchases and returns newest first, with net totals", () => {
    const lines = itemPurchaseLines("rice", entries, suppliers);
    expect(lines.map((l) => [l.kind, l.qty, l.amount, l.supplier])).toEqual([["return", 1, -110, "Lyngdoh Traders"], ["purchase", 5, 550, "Lyngdoh Traders"], ["purchase", 10, 1000, "Lyngdoh Traders"]]);
    expect(itemTotals(lines)).toEqual({ qty: 14, amount: 1440, bills: 2 });
  });
  it("totals each vendor net of returns and splits it into days", () => {
    const v = supplierHistories(entries, suppliers);
    expect(v.map((x) => [x.name, x.amount, x.bills, x.returns])).toEqual([["Supplier not recorded", 130, 1, 0], ["Lyngdoh Traders", 1680, 2, 1]]);
    expect(v[1]?.days.map((d) => d.amount)).toEqual([440, 1240]);
    expect(entryAmount(entries[2]!)).toBe(-110);
  });
});

import { approvalStatus, purchaseAlerts, canReturnPurchase as canReturn2, remainingPurchaseQty as remaining2, supplierHistories as vendors2, itemPurchaseLines as lines2 } from "./purchase-logic";
describe("purchase approval", () => {
  const now = Date.now();
  const entry = (id: string, status?: "pending" | "approved" | "rejected", extra: Record<string, unknown> = {}) => ({ id, type: "purchase", at: now - 1000, supplierName: "Lyngdoh Traders", items: [{ materialId: "rice", qty: 10, unitCost: 50 }],
    ...(status ? { approval: { status, requestedBy: "Billdesk", requestedLogin: "billdesk", requestedAt: now - 1000, ...(status !== "pending" ? { decidedBy: "Admin" } : {}) } } : {}), ...extra }) as never;
  it("only approved purchases count in item history and vendor totals; admin-recorded ones count as approved", () => {
    const all = [entry("a"), entry("p", "pending"), entry("r", "rejected"), entry("ok", "approved")];
    expect(approvalStatus(all[0]!)).toBe("approved");
    expect(lines2("rice", all, []).map((l) => l.entryId).sort()).toEqual(["a", "ok"]);
    expect(vendors2(all, [])[0]?.amount).toBe(1000);
  });
  it("returns need an approved purchase; waiting returns hold quantity, rejected ones don't", () => {
    expect(canReturn2(entry("p", "pending"))).toBe(false);
    expect(canReturn2(entry("ok", "approved"))).toBe(true);
    const purchase = entry("ok", "approved");
    const ret = (id: string, status: "pending" | "rejected", qty: number) => ({ id, type: "return", purchaseId: "ok", at: now, items: [{ materialId: "rice", qty: -qty, unitCost: 50 }], approval: { status, requestedBy: "Billdesk", requestedAt: now } }) as never;
    expect(remaining2(purchase, [ret("x", "pending", 3), ret("y", "rejected", 5)], "rice")).toBe(7);
  });
  it("alerts admins about new requests and the sender about decisions, never the other way round", () => {
    const admin = { admin: true, name: "Admin", login: "admin" };
    const desk = { admin: false, name: "Billdesk", login: "billdesk" };
    const p = entry("p", "pending");
    expect(purchaseAlerts([p], {}, admin).map((a) => a.kind)).toEqual(["requested"]);
    expect(purchaseAlerts([p], { p: "pending" }, admin)).toEqual([]);
    expect(purchaseAlerts([p], {}, desk)).toEqual([]);
    const approved = entry("p", "approved");
    expect(purchaseAlerts([approved], { p: "pending" }, desk).map((a) => a.kind)).toEqual(["approved"]);
    expect(purchaseAlerts([approved], { p: "pending" }, admin)).toEqual([]);
    expect(purchaseAlerts([entry("p", "rejected")], { p: "pending" }, desk).map((a) => a.kind)).toEqual(["rejected"]);
  });
});

import { canRequestReturn, purchaseAlerts as alertsFor, requestedByMe } from "./purchase-logic";
describe("bill desk returns and decision alerts", () => {
  const now = 1_700_000_000_000;
  const purchase = (status: "pending" | "approved" | "rejected", login: string, extra: Record<string, unknown> = {}) => ({ id: `p-${login}-${status}`, type: "purchase", at: now - 3_600_000,
    items: [{ materialId: "rice", qty: 5, unitCost: 100 }], approval: { status, requestedBy: "Billdesk", requestedLogin: login, requestedAt: now - 3_600_000, ...extra } }) as never;
  const desk = { name: "Billdesk", login: "billdesk@xtsy.pos" };
  it("lets the bill desk return only its own approved purchases", () => {
    expect(canRequestReturn(purchase("approved", "billdesk@xtsy.pos"), desk, now)).toBe(true);
    expect(canRequestReturn(purchase("approved", "someone@xtsy.pos"), desk, now)).toBe(false);
    expect(canRequestReturn(purchase("pending", "billdesk@xtsy.pos"), desk, now)).toBe(false);
    expect(canRequestReturn({ id: "admin-made", type: "purchase", at: now - 1000, items: [] } as never, desk, now)).toBe(false);
    expect(requestedByMe(purchase("pending", "billdesk@xtsy.pos"), desk)).toBe(true);
  });
  it("tells the sender and the other admins about a decision, not the admin who made it", () => {
    const e = purchase("approved", "billdesk@xtsy.pos", { decidedBy: "Admin" });
    const seen = { [(e as { id: string }).id]: "pending" };
    expect(alertsFor([e], seen, { admin: false, ...desk }).map((a) => a.kind)).toEqual(["approved"]);
    expect(alertsFor([e], seen, { admin: true, name: "Manager", login: "m@xtsy.pos" }).map((a) => a.kind)).toEqual(["approved"]);
    expect(alertsFor([e], seen, { admin: true, name: "Admin", login: "admin@xtsy.pos" })).toEqual([]);
  });
});
