import { describe, expect, it } from "vitest";
import {
  acceptBlockedReason, canConfirmForPayment, canPayOnRoomBill, canSendPayment, extFor, guestPayLine,
  initialPayState, isPayState, MAX_PROOF_BYTES, owesPayment, payLabel, proofPath, proofProblem,
} from "./guest-payment-logic";

describe("prepaid QR orders", () => {
  it("allows deferred payment only for in-house room service", () => {
    expect(canPayOnRoomBill("table", true)).toBe(true);
    expect(canPayOnRoomBill("table", false)).toBe(false);
    expect(canPayOnRoomBill("online", true)).toBe(false);
    expect(canPayOnRoomBill("online", false)).toBe(false);
  });
  it("only collects money from orders that chose to pay now", () => {
    expect(initialPayState("upi")).toBe("awaiting_confirm");
    expect(initialPayState("counter")).toBe("none");
    expect(isPayState("paid")).toBe(true);
    expect(isPayState("refunded")).toBe(false);
  });

  it("holds the kitchen until the money arrives", () => {
    expect(acceptBlockedReason("awaiting_confirm")).toMatch(/Confirm the order first/);
    expect(acceptBlockedReason("awaiting_payment")).toMatch(/Waiting for the guest/);
    expect(acceptBlockedReason("paid")).toBeNull();
    // Pay at the counter is accepted straight away, exactly as before.
    expect(acceptBlockedReason("none")).toBeNull();
  });

  it("knows when money is still owed", () => {
    expect(owesPayment("awaiting_confirm")).toBe(true);
    expect(owesPayment("awaiting_payment")).toBe(true);
    expect(owesPayment("paid")).toBe(false);
    expect(owesPayment("none")).toBe(false);
  });

  it("confirms for payment only once, on an order nobody has handled", () => {
    expect(canConfirmForPayment("new", "awaiting_confirm")).toBe(true);
    expect(canConfirmForPayment("new", "awaiting_payment")).toBe(false); // already confirmed
    expect(canConfirmForPayment("accepted", "awaiting_confirm")).toBe(false);
    expect(canConfirmForPayment("new", "none")).toBe(false); // pays at the counter
  });

  it("takes the guest's payment only between confirm and accept", () => {
    expect(canSendPayment("new", "awaiting_payment")).toBe(true);
    expect(canSendPayment("new", "awaiting_confirm")).toBe(false); // told not to pay yet
    expect(canSendPayment("new", "paid")).toBe(false); // no paying twice
    expect(canSendPayment("cancelled", "awaiting_payment")).toBe(false);
  });

  it("tells each side what is happening in its own words", () => {
    expect(payLabel("awaiting_confirm", "upi")).toMatch(/Confirm so the guest can pay/);
    expect(payLabel("paid", "upi")).toMatch(/Paid/);
    expect(payLabel("none", "counter")).toMatch(/counter/);
    expect(guestPayLine("awaiting_confirm")).toMatch(/Don't pay yet/);
    expect(guestPayLine("awaiting_payment")).toMatch(/Pay now/);
    expect(guestPayLine("paid")).toMatch(/checking it/);
    expect(guestPayLine("none")).toBe("");
  });

  it("checks the screenshot before sending it", () => {
    expect(proofProblem(null)).toMatch(/Attach/);
    expect(proofProblem({ size: 1000, type: "image/jpeg" })).toBeNull();
    expect(proofProblem({ size: 1000, type: "IMAGE/PNG" })).toBeNull();
    expect(proofProblem({ size: 1000, type: "application/pdf" })).toMatch(/JPG, PNG or WEBP/);
    expect(proofProblem({ size: MAX_PROOF_BYTES + 1, type: "image/jpeg" })).toMatch(/5 MB/);
  });

  it("keeps each order's screenshot in its own folder", () => {
    expect(proofPath("abc-123", "png")).toBe("abc-123/proof.png");
    expect(proofPath("abc-123", "../../etc")).toBe("abc-123/proof.etc");
    expect(extFor("image/png")).toBe("png");
    expect(extFor("image/webp")).toBe("webp");
    expect(extFor("image/heic")).toBe("heic");
    expect(extFor("image/jpeg")).toBe("jpg");
  });
});
