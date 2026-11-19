import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Order } from "@/lib/types";

const saved: Order[] = [];
vi.mock("@/lib/bill-amend", () => ({
  saveAmendment: async (o: Order) => { saved.push(o); },
}));
const { AmendBillForm, AmendmentHistory } = await import("./AmendBill");

const lines = [[180, 1], [129, 3], [199, 2], [39, 2], [160, 2], [299, 1]].map(([price, qty], i) => ({ itemId: `i${i}`, name: "x", price, qty, gstRate: 5 })) as Order["lines"];
const settledAt = Date.now() - 3_600_000;
const nc: Order = {
  uid: "b1", billNo: "POS/0002", orderType: "dine-in", lines, subtotal: 1662, discountPct: 100, discountAmt: 1662, taxable: 0,
  cgst: 0, sgst: 0, roundOff: 0, total: 0, payments: [], status: "settled", settledAt, createdAt: settledAt - 1000,
  tax: { exempt: true, roundToRupee: true }, synced: true,
};

describe("Correct payment form", () => {
  it("NC → 30% with GPay ₹663 + cash ₹500, reason required, saves the correction", async () => {
    saved.length = 0;
    const done = vi.fn();
    render(<AmendBillForm order={nc} by="Admin" onDone={done} />);
    fireEvent.change(screen.getByLabelText("Discount %"), { target: { value: "30" } });
    expect(screen.getByText("New bill").nextSibling).toHaveTextContent("₹1,163.00");
    fireEvent.change(screen.getByLabelText("Payment mode"), { target: { value: "upi" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "663" } });
    expect(screen.getByText("Short")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add payment/ }));
    expect((screen.getAllByLabelText("Amount")[1] as HTMLInputElement).value).toBe("500");
    expect(screen.getAllByLabelText("Payment mode")[1]).toHaveValue("cash");
    const saveBtn = screen.getByRole("button", { name: /Save correction · ₹1,163/ });
    expect(saveBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Closed as NC by mistake" } });
    await act(async () => { fireEvent.click(saveBtn); });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ total: 1163, roundOff: -0.4, discountPct: 30, payments: [{ mode: "upi", amount: 663 }, { mode: "cash", amount: 500 }], settledAt });
    expect(saved[0]!.amendments![0]).toMatchObject({ by: "Admin", reason: "Closed as NC by mistake" });
    expect(done).toHaveBeenCalled();

    render(<AmendmentHistory order={saved[0]!} />);
    expect(screen.getByText(/No payment \(NC\) \(₹0\) → UPI ₹663 \+ Cash ₹500 \(₹1,163\)/)).toBeInTheDocument();
  });

  it("guest paid ₹1162: Round off, then saves at ₹1162", async () => {
    saved.length = 0;
    render(<AmendBillForm order={nc} by="Admin" onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Discount %"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1162" } });
    fireEvent.click(screen.getByRole("button", { name: /Round off −₹1.00 · bill ₹1,162/ }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Paid 1162" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Save correction · ₹1,162/ })); });
    expect(saved[0]).toMatchObject({ total: 1162, roundOff: -1.4 });
  });
});
