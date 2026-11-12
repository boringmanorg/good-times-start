import { describe, expect, it } from "vitest";
import { billSlip, columnsFor, escPos, kotSlip, plain, rawbtIntent, wrap } from "./slip";
import type { Kot, Order, RestaurantSettings } from "./types";

const settings: RestaurantSettings = {
  name: "TAB Bistro by XTSY", address: "Mawdiangdiang, New Shillong Township\nMeghalaya 793018",
  billFooter: "Flavour Food Fusion\nFor Delivery / Table Booking\nWhatsApp: +91 8837317070", gstMode: "unregistered",
} as RestaurantSettings;

// The bill from the photo: Room 7, Masala Bread Omelette ₹169 + Black Tea ₹39 = ₹208.
const bill: Order = {
  uid: "b1", billNo: "SJT/26-27/0835", orderType: "dine-in", tableId: "ROOM-7A", tableLabel: "Room 7A",
  lines: [
    { itemId: "omelette", name: "Masala Bread Omelette", price: 169, qty: 1, veg: false, gstRate: 5, station: "Breakfast" },
    { itemId: "tea", name: "Black Tea", price: 39, qty: 1, veg: true, gstRate: 5, station: "Beverages" },
  ],
  subtotal: 208, discountPct: 0, discountAmt: 0, cgst: 0, sgst: 0, roundOff: 0, total: 208,
  payments: [{ mode: "cash", amount: 208 }], status: "settled", createdAt: new Date(2026, 5, 2, 9, 58).getTime(), synced: true,
  customer: { name: "Kalidhas", phone: "8714040109" }, closedBy: "Reception", tax: { exempt: true, inclusive: false, roundToRupee: true },
};

// The KOT from the photo: D2, noodles and parotta.
const kot: Kot = {
  uid: "k1", orderId: 1, billNo: "SJT/26-27/0008", station: "Chinese", kind: "order", tableId: "D2", tableLabel: "D2", orderType: "dine-in",
  lines: [{ name: "Chicken Burned Garlic Hakka Noodles", qty: 1 }, { name: "Kerala Parotta [2 Pcs] With Chicken Gravy", qty: 1, note: "less spicy" }],
  status: "new", createdAt: new Date(2026, 9, 3, 19, 45).getTime(),
};

const text = (lines: { text: string }[]) => lines.map((l) => l.text).join("\n");

describe("thermal slips", () => {
  it("uses the printable width with a small safe side margin on both paper sizes", () => {
    expect(columnsFor(58)).toBe(30);
    expect(columnsFor(80)).toBe(45);
    expect(billSlip(bill, settings, 58).endFeedMm).toBe(30);
  });

  for (const paper of [80, 58] as const) {
    it(`fits every bill and KOT line on ${paper} mm paper`, () => {
      const cols = columnsFor(paper);
      for (const slip of [billSlip(bill, settings, paper), kotSlip([kot], paper)]) {
        for (const line of slip.lines) expect(line.text.length, line.text).toBeLessThanOrEqual(line.size === "big" ? cols / 2 : cols);
      }
    });
  }

  it("lays the bill out like the restaurant's slips, with numbers lined up", () => {
    const slip = billSlip(bill, settings, 80);
    const t = text(slip.lines);
    expect(slip.lines[0]).toMatchObject({ text: "TAB Bistro by XTSY", align: "center", bold: true, size: "big" });
    for (const want of ["Mawdiangdiang, New Shillong Township", "Meghalaya 793018", "DINE IN", "Bill: SJT/26-27/0835", "Date: 02-06-2026 09:58 AM",
      "Guest: Kalidhas/8714040109", "Cashier: Reception", "Table: Room 7A", "Flavour Food Fusion", "For Delivery / Table Booking", "WhatsApp: +91 8837317070"]) {
      expect(t).toContain(want);
    }
    const header = slip.lines.find((l) => l.text.startsWith("Item"))!.text;
    const omelette = slip.lines.find((l) => l.text.startsWith("Masala Bread Omelette"))!.text;
    expect(omelette.length).toBe(45);
    expect(omelette.endsWith("169.00")).toBe(true);
    expect(header.indexOf("Amt") + 3).toBe(omelette.length); // amounts end under "Amt"
    expect(slip.lines.find((l) => l.text.startsWith("TOTAL"))).toMatchObject({ size: "big", bold: true });
    expect(slip.lines.find((l) => l.text.startsWith("TOTAL"))!.text.trim().endsWith("208.00")).toBe(true);
    expect(t).toMatch(/Total qty\s+2/);
    expect(t).toMatch(/Paid by Cash\s+208\.00/);
    expect(t).not.toMatch(/CGST|SGST/); // GST registration pending: no tax lines
  });

  it("shows CGST and SGST with their rate once the bill carries GST", () => {
    const taxed = billSlip({ ...bill, cgst: 5.2, sgst: 5.2, total: 218, tax: { exempt: false, inclusive: false, roundToRupee: true } }, { ...settings, gstin: "17ABCDE1234F1Z5", gstMode: "regular" } as RestaurantSettings, 80);
    expect(text(taxed.lines)).toMatch(/CGST 2\.5%\s+5\.20/);
    expect(text(taxed.lines)).toContain("TAX INVOICE");
  });

  it("prints the KOT with big order type and table, and tall bold items", () => {
    const slip = kotSlip([kot], 80);
    const t = text(slip.lines);
    expect(t).toContain("Running KOT");
    expect(slip.lines.find((l) => l.text === "DINE IN")).toMatchObject({ size: "big", bold: true });
    expect(slip.lines.find((l) => l.text === "TBL: D2")).toMatchObject({ size: "big", bold: true });
    expect(t).toContain("Date: 03-10-2026  Time: 07:45 PM");
    expect(slip.lines.find((l) => /^\d+ x Chicken Burned Garlic/.test(l.text))).toMatchObject({ size: "tall", bold: true });
    expect(t).toContain("NOTE: less spicy");
    expect(t).toContain("Total Qty: 2");
    expect(text(kotSlip([{ ...kot, kind: "cancel" }], 80).lines)).toContain("CANCEL KOT");
  });

  it("wraps long names inside their column on 58 mm paper", () => {
    const lines = kotSlip([kot], 58).lines.map((l) => l.text);
    expect(lines.some((l) => /^\d+ x Kerala Parotta/.test(l))).toBe(true);
    expect(lines.every((l) => l.length <= 30)).toBe(true);
  });

  it("makes ESC/POS bytes: initialise, text, feed and cut, once per copy", () => {
    const bytes = escPos(billSlip(bill, settings, 80), { copies: 2 });
    const asText = String.fromCharCode(...bytes);
    expect([bytes[0], bytes[1]]).toEqual([0x1b, 0x40]);
    expect(asText).toContain("Masala Bread Omelette");
    expect(asText.split("\x1dV\x00").length - 1).toBe(0);
    expect(String.fromCharCode(...escPos(billSlip(bill, settings, 80), { cutter: "full" })).split("\x1dV\x00").length - 1).toBe(1);
    expect(rawbtIntent(Uint8Array.from([0x1b, 0x40]))).toBe("intent:base64,G0A=#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;");
  });

  it("feeds 3 cm before each KOT, 1 cm after it, and 3 cm after the main bill", () => {
    const slip = kotSlip([kot], 58);
    expect(slip.startFeedMm).toBe(30);
    expect(slip.endFeedMm).toBe(10);
    const bytes = Array.from(escPos(slip));
    // 30 mm at 203 dpi = 240 dots, fed right after the printer set-up.
    expect(bytes.slice(10, 17)).toEqual([0x1d, 0x50, 203, 203, 0x1b, 0x4a, 240]);
    // 10 mm = 80 dots at the end.
    expect(bytes.slice(-7)).toEqual([0x1d, 0x50, 203, 203, 0x1b, 0x4a, 80]);
    expect(Array.from(escPos(slip, { cutter: "partial" }).slice(-3))).toEqual([0x1d, 0x56, 0x01]);
    const bill58 = billSlip(bill, settings, 58);
    expect(bill58.endFeedMm).toBe(30);
    expect(bill58.startFeedMm).toBeUndefined();
    expect(Array.from(escPos(bill58)).slice(-7)).toEqual([0x1d, 0x50, 203, 203, 0x1b, 0x4a, 240]);
  });

  it("marks waiter-originated bills on the thermal receipt", () => {
    const waiterBill = { ...bill, source: "waiter" as const };
    expect(billSlip(waiterBill, settings, 58).lines.some((line) => line.text === "Printed through XTSY Waiter")).toBe(true);
  });

  it("keeps text printable on any thermal printer", () => {
    expect(plain("₹120 × 2 — Crème brûlée")).toBe("Rs.120 x 2 - Creme brulee");
    expect(wrap("Kerala Parotta [2 Pcs] With Chicken Gravy", 20)).toEqual(["Kerala Parotta [2", "Pcs] With Chicken", "Gravy"]);
  });
});

describe("KOT quantities", () => {
  it("prints the quantity first, so a clipped right edge can't hide it (4 x Tawa Roti)", () => {
    const kot = { uid: "k", kind: "kot", kotNo: "KOT/0049", station: "Hot Tandoori Breads", tableLabel: "Room 8A", tableSection: "Rooms", createdAt: new Date(2026, 10, 10, 20, 39).getTime(),
      lines: [{ itemId: "roti|v:1", name: "Tawa Roti [1Pc] (Regular)", qty: 4 }] } as never;
    for (const paper of [58, 80] as const) {
      const slip = kotSlip([kot], paper);
      const texts = slip.lines.map((l) => l.text);
      expect(texts).toContain("4 x Tawa Roti [1Pc] (Regular)".slice(0, texts.find((t) => t.startsWith("4 x "))!.length));
      expect(texts.find((t) => t.startsWith("4 x "))).toMatch(/^4 x Tawa Roti/);
      expect(texts).toContain("Total Qty: 4");
      expect(texts.some((t) => t.includes("08:39 PM"))).toBe(true);
      expect(texts.every((t) => !t.endsWith("Time:"))).toBe(true);
    }
  });
});

import { layoutOf } from "./slip";
import { normalisePrintConfig, slipLayoutOf } from "./print-logic";
describe("slips fit the paper", () => {
  const kot = { uid: "k", kind: "kot", kotNo: "KOT/0049", station: "Hot Tandoori Breads", tableLabel: "Room 8A", tableSection: "Rooms", createdAt: new Date(2026, 10, 10, 20, 39).getTime(),
    lines: [{ itemId: "roti|v:1", name: "Tawa Roti [1Pc] (Regular)", qty: 4 }, { itemId: "n", name: "Burned Garlic Hakka Noodles (Veg)", qty: 3, note: "less spicy please, no onion" }] } as never;
  const bill = { uid: "b", billNo: "POS/0002", orderType: "dine-in", tableLabel: "Room 10A", status: "held", createdAt: Date.now(), synced: true,
    lines: [{ itemId: "x", name: "Kerala Parotta (2 pcs) with Chicken Gravy", price: 199, qty: 2, veg: false, gstRate: 0, station: "Indian" }, { itemId: "c", name: "Curd Rice", price: 180, qty: 1, veg: true, gstRate: 0, station: "Indian" }],
    subtotal: 1533, discountPct: 0, discountAmt: 0, cgst: 0, sgst: 0, roundOff: 0, total: 1533, payments: [] } as never;
  const settings = { name: "TAB Bistro by XTSY", address: "New Shillong Township, Meghalaya", footer: "Flavour Food Fusion For Delivery / Table Booking WhatsApp: +91 8837317070" } as never;
  it("every bill and KOT line fits the line width, so amounts and quantities are never cut (58 and 80 mm)", () => {
    for (const paper of [58, 80] as const) {
      const lay = slipLayoutOf(normalisePrintConfig({ paper }));
      const cols = layoutOf(lay).cols;
      for (const slip of [billSlip(bill, settings, lay), kotSlip([kot], lay)]) {
        expect(slip.cols).toBe(cols);
        expect(slip.marginMm).toBe(1.5);
        for (const l of slip.lines) expect(l.text.length, l.text).toBeLessThanOrEqual(l.size === "big" ? Math.floor(cols / 2) : cols);
      }
    }
    const texts = billSlip(bill, settings, 58).lines.map((l) => l.text);
    expect(texts.some((t) => /1533\.00$/.test(t.trim()))).toBe(true);
  });
  it("prints the full line inside a 58 mm printer's 48 mm even in the widest monospace font", () => {
    // The browser slip sizes its font to (48 mm − 2 × margin) / (cols × 0.6 em × 1.02).
    const font = Math.min(2.65, (48 - 3) / (30 * 0.6 * 1.02));
    expect(30 * 0.6 * font + 3).toBeLessThanOrEqual(48);
  });
  it("keeps a sensible column count", () => {
    expect(layoutOf(58)).toEqual({ paper: 58, cols: 30, marginMm: 0 });
    expect(layoutOf({ paper: 80, cols: 99 }).cols).toBe(45);
    expect(layoutOf({ paper: 58, cols: 4 }).cols).toBe(16);
  });
  it("sends the side margin to ESC/POS printers (GS L)", () => {
    const bytes = [...escPos(kotSlip([kot], { paper: 58, marginMm: 1.5 }))];
    const at = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x4c);
    expect([bytes[at + 2], bytes[at + 3]]).toEqual([12, 0]);
  });
});
