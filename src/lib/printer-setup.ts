import { Printer } from "lucide-react";
import { printKots } from "@/lib/print-jobs";
import type { Order } from "@/lib/types";

/** The Chrome shortcut that makes this computer print bills and KOTs with no print box. */
export function kioskShortcut(origin: string, path: string, os: "windows" | "mac"): string {
  const url = `${origin}${path}`;
  return os === "mac"
    ? `open -na "Google Chrome" --args --kiosk-printing --app="${url}"`
    : `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="${url}"`;
}


/** Test slips: one KOT and one bill, never saved anywhere. */
export function testKot(station: string): Parameters<typeof printKots>[0] {
  const now = Date.now();
  return [{ uid: `test-${now}`, orderId: 0, billNo: "TEST/0001", station, kind: "order", orderType: "dine-in", tableLabel: "Room 7A",
    lines: [{ name: "Masala Bread Omelette", qty: 1 }, { name: "Black Tea", qty: 2, note: "Printer check" }], status: "new", createdAt: now }];
}

export function testBill(): Order {
  return { uid: "test-bill", billNo: "TEST/0001", orderType: "dine-in", tableLabel: "Room 7A",
    lines: [
      { itemId: "t1", name: "Masala Bread Omelette", price: 169, qty: 1, veg: false, gstRate: 5, station: "Kitchen" },
      { itemId: "t2", name: "Black Tea", price: 39, qty: 2, veg: true, gstRate: 5, station: "Kitchen" },
    ],
    subtotal: 247, discountPct: 0, discountAmt: 0, cgst: 0, sgst: 0, roundOff: 0, total: 247, payments: [{ mode: "cash", amount: 247 }],
    status: "settled", createdAt: Date.now(), synced: true, closedBy: "Test print", tax: { exempt: true, inclusive: false, roundToRupee: true } };
}
