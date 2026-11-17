import { describe, expect, it } from "vitest";
import { cardState, giftCardTotals, issueProblem, redeemProblem, type GiftCard } from "./gift-card-logic";

const today = "2026-11-17";
const card = (p: Partial<GiftCard>): GiftCard => ({ id: "1", code: "GCABCDEFGH", initial_amount: 1000, balance: 1000, issued_restaurant_id: "r1", guest_name: null, guest_phone: null, expires_on: null, status: "active", created_at: "", ...p });

describe("gift cards", () => {
  it("refuses taking more than what is left", () => {
    expect(redeemProblem(card({ balance: 300 }), "301", today)).toBe("Only ₹300 left on this card");
    expect(redeemProblem(card({ balance: 300 }), "300", today)).toBeNull();
  });
  it("refuses expired and cancelled cards", () => {
    expect(redeemProblem(card({ expires_on: "2026-11-16" }), "10", today)).toBe("This gift card has expired");
    expect(redeemProblem(card({ status: "void" }), "10", today)).toBe("This gift card has been cancelled");
    expect(cardState(card({ expires_on: today }), today)).toBe("active");
  });
  it("caps a card at ₹1,00,000 and refuses past expiry", () => {
    expect(issueProblem("100001", "", today)).not.toBeNull();
    expect(issueProblem("500", "2026-11-01", today)).toBe("Expiry date is in the past");
    expect(issueProblem("500", "", today)).toBeNull();
  });
  it("totals leave out cancelled cards", () => {
    const t = giftCardTotals([card({ balance: 400 }), card({ id: "2", status: "void" })], today);
    expect(t).toEqual({ issued: 1000, outstanding: 400, redeemed: 600, active: 1 });
  });
});
