import { describe, expect, it } from "vitest";
import { changeLines, kindLabel, lineChanges, valueText, type AuditEntry } from "./audit-log";

const entry = (changes: AuditEntry["changes"]): AuditEntry => ({ id: 1, at: "2026-11-10T10:00:00Z", user_id: null, user_email: null, device_id: null, kind: "menu", record_id: "x", action: "changed", label: "Curd Rice", changes });

describe("audit log text", () => {
  it("shows money, yes/no and plain values readably", () => {
    expect(changeLines(entry([{ field: "price", from: 180, to: 200 }, { field: "veg", from: false, to: true }, { field: "station", from: null, to: "Snack Corner" }])))
      .toEqual(["Price: ₹180 → ₹200", "Veg: No → Yes", "Station: — → Snack Corner"]);
  });
  it("spells out which bill items were added, removed or changed", () => {
    const from = [{ uid: "a", name: "Masala Dosa", qty: 1, price: 180 }, { uid: "b", name: "Curd Rice", qty: 1, price: 180 }];
    const to = [{ uid: "a", name: "Masala Dosa", qty: 2, price: 180 }, { uid: "c", name: "Egg Dosa", qty: 1, price: 160 }];
    expect(lineChanges(from, to)).toEqual(["Masala Dosa 1 → 2", "+ Egg Dosa ×1", "− Curd Rice ×1"]);
    expect(changeLines(entry([{ field: "lines", from, to }]))[0]).toBe("Items: Masala Dosa 1 → 2");
  });
  it("summarises lists and names record types", () => {
    expect(valueText("payments", [{ a: 1 }, { b: 2 }])).toBe("2 entries");
    expect(kindLabel("order")).toBe("Bill");
    expect(kindLabel("material")).toBe("Purchase item");
  });
});
