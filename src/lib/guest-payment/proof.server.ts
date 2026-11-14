/**
 * Server only. Payment screenshots for prepaid QR orders.
 *
 * The bucket is private and has no anon policy: guests upload through here, with their order
 * token as the proof of who they are, and staff get a short-lived signed link after a
 * membership check. So a screenshot is never reachable by guessing a URL.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canSendPayment, extFor, isPayState, MAX_PROOF_BYTES, proofPath, proofProblem } from "@/lib/guest-payment-logic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin as unknown as { from: (t: string) => any; storage: any };

const BUCKET = "guest-payments";
/** A signed link lives just long enough for staff to open it, never long enough to pass around. */
const LINK_SECONDS = 600;

export interface SendProof { orderId: string; token: string; mime: string; dataBase64: string; upiRef: string }

/** The guest sends the screenshot and confirms the payment. */
export async function sendPaymentProof(input: SendProof): Promise<{ payState: string }> {
  const { data: row } = await admin().from("guest_orders")
    .select("id, token, status, pay_state, restaurant_id").eq("id", input.orderId).maybeSingle();
  const order = row as { id: string; token: string; status: string; pay_state: string } | null;
  if (!order || order.token !== input.token) throw new Error("Order not found.");
  if (!canSendPayment(order.status, isPayState(order.pay_state) ? order.pay_state : "none")) {
    throw new Error(order.pay_state === "paid"
      ? "This payment has already been sent."
      : "The restaurant hasn't asked for payment on this order yet.");
  }

  const bytes = Buffer.from(input.dataBase64, "base64");
  const problem = proofProblem({ size: bytes.byteLength, type: input.mime });
  if (problem) throw new Error(problem);
  if (bytes.byteLength > MAX_PROOF_BYTES) throw new Error("That image is over 5 MB. Send a smaller screenshot.");

  const path = proofPath(order.id, extFor(input.mime));
  const { error: upload } = await admin().storage.from(BUCKET)
    .upload(path, bytes, { contentType: input.mime, upsert: true });
  if (upload) throw new Error("Couldn't send the screenshot. Check your connection and try again.");

  const { error } = await admin().from("guest_orders").update({
    pay_state: "paid",
    pay_proof: path,
    paid_at: new Date().toISOString(),
    payment: "upi",
    upi_ref: input.upiRef.replace(/[^A-Za-z0-9]/g, "").slice(0, 40),
  }).eq("id", order.id);
  if (error) throw new Error("Couldn't record the payment. Try again.");
  return { payState: "paid" };
}

/** Staff open the screenshot: a signed link, after checking they belong to the restaurant. */
export async function proofLink(userId: string, orderId: string): Promise<{ url: string }> {
  const { data: row } = await admin().from("guest_orders")
    .select("id, restaurant_id, pay_proof").eq("id", orderId).maybeSingle();
  const order = row as { restaurant_id: string; pay_proof: string | null } | null;
  if (!order?.pay_proof) throw new Error("No screenshot on this order.");
  const { data: member } = await admin().from("restaurant_members")
    .select("role").eq("restaurant_id", order.restaurant_id).eq("user_id", userId).maybeSingle();
  if (!member) throw new Error("Not permitted.");

  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(order.pay_proof, LINK_SECONDS);
  if (error || !data?.signedUrl) throw new Error("Couldn't open the screenshot. Try again.");
  return { url: data.signedUrl as string };
}
