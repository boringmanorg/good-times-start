/** Gift cards shared by every outlet of a brand. Pure rules, tested; the cloud enforces the same. */
export interface GiftCard {
  id: string; code: string; initial_amount: number; balance: number; issued_restaurant_id: string;
  guest_name: string | null; guest_phone: string | null; expires_on: string | null; status: "active" | "void"; created_at: string;
}
export interface GiftCardEvent { id: string; card_id: string; restaurant_id: string; kind: "issue" | "redeem" | "void"; amount: number; bill_no: string | null; at: string }

export const MAX_GIFT_CARD = 100000;

export function issueProblem(amount: string, expiresOn: string, today: string): string | null {
  const n = Number(amount);
  if (!amount.trim() || !Number.isFinite(n) || n <= 0) return "Enter the amount to load";
  if (n > MAX_GIFT_CARD) return `A card can hold up to ₹${MAX_GIFT_CARD.toLocaleString("en-IN")}`;
  if (expiresOn && expiresOn < today) return "Expiry date is in the past";
  return null;
}

/** What a card can do today: usable, used up, expired or cancelled. */
export function cardState(card: Pick<GiftCard, "status" | "balance" | "expires_on">, today: string): "active" | "used" | "expired" | "void" {
  if (card.status === "void") return "void";
  if (card.expires_on && card.expires_on < today) return "expired";
  if (Number(card.balance) <= 0) return "used";
  return "active";
}

export function redeemProblem(card: Pick<GiftCard, "status" | "balance" | "expires_on"> | null, amount: string, today: string): string | null {
  if (!card) return "Look up a card first";
  const state = cardState(card, today);
  if (state === "void") return "This gift card has been cancelled";
  if (state === "expired") return "This gift card has expired";
  if (state === "used") return "Nothing left on this card";
  const n = Number(amount);
  if (!amount.trim() || !Number.isFinite(n) || n <= 0) return "Enter the amount to take";
  if (Math.round(n * 100) > Math.round(Number(card.balance) * 100)) return `Only ₹${Number(card.balance).toLocaleString("en-IN")} left on this card`;
  return null;
}

/** Brand totals: money loaded on active cards, what's still owed to guests, and what's been spent. */
export function giftCardTotals(cards: GiftCard[], today: string) {
  let issued = 0, outstanding = 0, active = 0;
  for (const c of cards) {
    if (c.status === "void") continue;
    issued += Number(c.initial_amount);
    if (cardState(c, today) === "active") { outstanding += Number(c.balance); active += 1; }
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  return { issued: r(issued), outstanding: r(outstanding), redeemed: r(cards.filter((c) => c.status !== "void").reduce((s, c) => s + Number(c.initial_amount) - Number(c.balance), 0)), active };
}

export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");
