/**
 * Prepaid QR orders: the guest pays only once the restaurant has confirmed it can make the
 * order, then uploads the payment screenshot. Pure helpers shared by the guest page and the POS.
 *
 * The order's own `status` is untouched by all this — payment runs alongside it on `pay_state`,
 * so a pay-at-counter order behaves exactly as it always has.
 *
 *   awaiting_confirm  order placed, the restaurant hasn't looked at it yet
 *   awaiting_payment  the restaurant confirmed; the guest can now pay
 *   paid              the guest sent the screenshot and confirmed
 *   none              pay at the counter / on delivery / on the room bill — nothing to collect here
 */
export type PayState = "none" | "awaiting_confirm" | "awaiting_payment" | "paid";

export const PAY_STATES: PayState[] = ["none", "awaiting_confirm", "awaiting_payment", "paid"];
export const isPayState = (v: unknown): v is PayState => PAY_STATES.includes(v as PayState);

/** What a prepaid order starts as. Pay-at-counter orders collect nothing here. */
export function initialPayState(payment: "counter" | "upi"): PayState {
  return payment === "upi" ? "awaiting_confirm" : "none";
}

/** Is the restaurant still waiting on the guest's money? */
export const owesPayment = (pay: PayState): boolean => pay === "awaiting_confirm" || pay === "awaiting_payment";

/**
 * A prepaid order must not reach the kitchen before the money does: Accept is held until the
 * guest has sent the screenshot. Pay-at-counter orders are accepted straight away, as before.
 */
export function acceptBlockedReason(pay: PayState): string | null {
  if (pay === "awaiting_confirm") return "Confirm the order first so the guest can pay.";
  if (pay === "awaiting_payment") return "Waiting for the guest to pay and send the screenshot.";
  return null;
}

/** The staff-facing line on a QR order card. */
export function payLabel(pay: PayState, payment: "counter" | "upi"): string {
  if (pay === "paid") return "Paid · screenshot sent";
  if (pay === "awaiting_payment") return "Waiting for payment";
  if (pay === "awaiting_confirm") return "Confirm so the guest can pay";
  return payment === "upi" ? "Pay by UPI" : "Pay at the counter";
}

/** The guest-facing line, above the pay button. */
export function guestPayLine(pay: PayState): string {
  if (pay === "paid") return "Payment sent. The restaurant is checking it and will start your order.";
  if (pay === "awaiting_payment") return "The restaurant can make your order. Pay now to confirm it.";
  if (pay === "awaiting_confirm") return "Waiting for the restaurant to confirm your order. Don't pay yet.";
  return "";
}

/** Only an order still waiting to be looked at can be confirmed for payment. */
export function canConfirmForPayment(status: string, pay: PayState): boolean {
  return status === "new" && pay === "awaiting_confirm";
}

/** The guest may send a payment only in the window between confirm and accept. */
export function canSendPayment(status: string, pay: PayState): boolean {
  return status === "new" && pay === "awaiting_payment";
}

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Why this screenshot can't be sent, or null. */
export function proofProblem(file: { size: number; type: string } | null): string | null {
  if (!file) return "Attach the payment screenshot.";
  if (!PROOF_TYPES.includes(file.type.toLowerCase())) return "Send a photo or screenshot (JPG, PNG or WEBP).";
  if (file.size > MAX_PROOF_BYTES) return "That image is over 5 MB. Send a smaller screenshot.";
  return null;
}

/** Where a screenshot is kept: one folder per order, so a signed link never exposes another order. */
export const proofPath = (orderId: string, ext: string) => `${orderId}/proof.${ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg"}`;

/** "image/jpeg" → "jpg" */
export function extFor(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/heic" || m === "image/heif") return "heic";
  return "jpg";
}
