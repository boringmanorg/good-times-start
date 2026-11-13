import { describe, expect, it } from "vitest";
import { recentPointAwards } from "./customer-logic";
import type { Order } from "./types";

// Guests are identified by their 10-digit mobile number (customer.id), matched to bills by customer.phone.
const PHONE = "9876543210";
const bill = (id: number, billNo: string, total: number) => ({ id, uid: `u${id}`, billNo, status: "settled", customerId: PHONE, customer: { name: "Ravi", phone: `+91 ${PHONE}` }, total, subtotal: total, discountAmt: 0, payments: [{ mode: "cash", amount: total }], createdAt: id }) as unknown as Order;
const guest = [{ id: PHONE, name: "Ravi" }];
const earlier = [1, 2, 3, 4, 5].map((i) => bill(i, `POS/000${i}`, 100));

describe("recentPointAwards", () => {
  it("an offline bill without a number waits for sync and earns nothing yet", () => {
    const b = bill(9, "", 1000);
    expect(recentPointAwards([b], [...earlier, b], guest, 1)[0]).toMatchObject({ pending: true, points: 0 });
  });
  it("once synced with a number, the same bill shows its points at once (1% of ₹1000 = 10)", () => {
    const b = bill(9, "POS/0009", 1000);
    expect(recentPointAwards([b], [...earlier, b], guest, 1)[0]).toMatchObject({ pending: false, points: 10 });
  });
});
