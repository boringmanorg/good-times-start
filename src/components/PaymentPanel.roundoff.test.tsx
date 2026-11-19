import { act, fireEvent, render, screen } from "@testing-library/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PaymentPanel } from "./PaymentDialogs";
import type { CartLine } from "@/lib/types";

const lines = [{ itemId: "thali", name: "Thali", price: 1662, qty: 1, gstRate: 5 } as CartLine];

function open(onSettle = vi.fn()) {
  render(
    <Dialog open><DialogContent>
      <PaymentPanel lines={lines} discountPct={30} serviceChargePct={0} tax={{ exempt: true, roundToRupee: true }}
        canSplitBill={false} allowedModes={["cash", "upi", "card"]} onSettle={onSettle} onSettlePart={vi.fn()} />
    </DialogContent></Dialog>,
  );
  return onSettle;
}
const amounts = () => screen.getAllByLabelText("Amount") as HTMLInputElement[];
const tapSettle = async () => {
  const settle = screen.getByRole("button", { name: /^Settle/ });
  await act(async () => { fireEvent.click(settle); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tap again/ })); });
};

describe("payment dialog round-off", () => {
  it("₹1163 bill, guest pays ₹1162: one tap rounds off −₹1 and settles at ₹1162", async () => {
    const onSettle = open();
    fireEvent.change(amounts()[0]!, { target: { value: "662" } });
    fireEvent.click(screen.getByRole("button", { name: /Add ₹501.00 by another mode/ }));
    fireEvent.change(amounts()[1]!, { target: { value: "500" } });
    expect(screen.getByText("Still due")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Settle/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Round off −₹1 · settle at ₹1,162" }));
    expect(screen.queryByText("Still due")).toBeNull();
    expect(screen.getByRole("button", { name: /^Settle ₹1,162/ })).toBeEnabled();

    await tapSettle();
    expect(onSettle).toHaveBeenCalledWith(
      [{ mode: "cash", amount: 662 }, { mode: "upi", amount: 500 }],
      { seen: 1163, pay: 1162 },
    );
  });

  it("Undo puts the bill back to ₹1163, and editing a payment drops the round-off", () => {
    open();
    fireEvent.change(amounts()[0]!, { target: { value: "1162" } });
    fireEvent.click(screen.getByRole("button", { name: /Round off −₹1 / }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: /^Settle ₹1,163/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Round off −₹1 / }));
    fireEvent.change(amounts()[0]!, { target: { value: "1150" } });
    expect(screen.getByRole("button", { name: /^Settle ₹1,163/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Round off −₹13 / })).toBeInTheDocument();
  });

  it("no round-off is offered beyond ₹100", () => {
    open();
    fireEvent.change(amounts()[0]!, { target: { value: "1000" } });
    expect(screen.queryByRole("button", { name: /Round off/ })).toBeNull();
  });

  it("an exact payment settles with no round-off passed", async () => {
    const onSettle = open();
    await tapSettle();
    expect(onSettle).toHaveBeenCalledWith([{ mode: "cash", amount: 1163 }], undefined);
  });
});
