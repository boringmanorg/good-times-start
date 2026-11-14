import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* Payment screenshots for prepaid QR orders. Server code loads inside each handler so the
   service role never reaches the browser.

   The guest's call is open (no sign-in — they are a guest) but proves itself with the order
   token, which only the person who placed the order has. Staff calls go through the normal
   staff session and a membership check. */

/** base64 of 5 MB plus the JSON around it; the real size check is on the decoded bytes. */
const MAX_BASE64 = 7_200_000;

export const sendGuestPaymentProof = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    orderId: z.string().uuid(),
    token: z.string().uuid(),
    mime: z.string().min(5).max(40),
    dataBase64: z.string().min(16).max(MAX_BASE64),
    upiRef: z.string().max(40),
  }).parse(input))
  .handler(async ({ data }) => {
    const { sendPaymentProof } = await import("./guest-payment/proof.server");
    return sendPaymentProof(data);
  });

export const guestPaymentProofLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { proofLink } = await import("./guest-payment/proof.server");
    return proofLink(context.userId, data.orderId);
  });
