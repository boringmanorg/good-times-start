import { useRef, useState } from "react";
import { Check, Clock, ImageUp, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR, upiLink } from "@/lib/billing";
import { sendGuestPaymentProof } from "@/lib/guest-payment.functions";
import { canSendPayment, guestPayLine, isPayState, proofProblem, type PayState } from "@/lib/guest-payment-logic";

interface Order { id: string; code: string; status: string; payState?: string | null; upiRef?: string | null }
interface Store { name: string; upiVpa?: string | undefined }

/** base64 without the "data:…;base64," prefix. */
const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Couldn't read that image."));
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.readAsDataURL(file);
});

/**
 * Prepaid QR orders. The guest is asked for money only once the restaurant has confirmed it
 * can make the order — paying for food nobody has agreed to cook is the thing to avoid — and
 * confirms by sending the payment screenshot.
 */
export function GuestPayment({ store, order, total, token, onPaid }: {
  store: Store; order: Order; total: number; token: string; onPaid: () => void;
}) {
  const pay: PayState = isPayState(order.payState) ? order.payState : "none";
  const [ref, setRef] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = useRef<HTMLInputElement>(null);

  if (pay === "none") return null;

  const send = async () => {
    const problem = proofProblem(file);
    if (problem || !file) { setError(problem ?? "Attach the payment screenshot."); return; }
    setBusy(true);
    setError("");
    try {
      await sendGuestPaymentProof({ data: {
        orderId: order.id, token, mime: file.type, dataBase64: await toBase64(file), upiRef: ref.trim(),
      } });
      onPaid();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't send the payment. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 font-semibold">
        {pay === "paid" ? <Check className="size-4 text-success" /> : pay === "awaiting_confirm" ? <Clock className="size-4" /> : <Smartphone className="size-4" />}
        {pay === "paid" ? "Payment sent" : pay === "awaiting_confirm" ? "Waiting for the restaurant" : "Pay to confirm your order"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{guestPayLine(pay)}</p>

      {pay === "paid" ? (
        <p className="mt-3 text-sm font-semibold text-success">
          Thanks. {store.name} is checking your payment{order.upiRef ? ` (ref ${order.upiRef})` : ""} and will start your order.
        </p>
      ) : null}

      {canSendPayment(order.status, pay) ? (
        <>
          {store.upiVpa ? (
            <a href={upiLink({ vpa: store.upiVpa, name: store.name, amount: total, billNo: order.code })}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
              <Smartphone className="size-4" />Pay {formatINR(total, 0)} in a UPI app
            </a>
          ) : (
            <p className="mt-3 rounded-lg bg-secondary p-3 text-sm">Ask {store.name} for their UPI number, pay {formatINR(total, 0)}, then send the screenshot below.</p>
          )}

          <p className="mt-4 text-sm font-semibold">Then send the screenshot</p>
          <input ref={pick} type="file" accept="image/*" className="sr-only"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }} />
          <button type="button" onClick={() => pick.current?.click()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-input px-3 py-4 text-sm font-semibold">
            <ImageUp className="size-4" />{file ? file.name.slice(0, 40) : "Choose the payment screenshot"}
          </button>
          <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40}
            placeholder="UPI reference number (optional)"
            className="mt-2 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm" />
          <Button className="mt-3 w-full" disabled={busy || !file} onClick={() => void send()}>
            {busy ? "Sending…" : "I've paid — send it"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Only {store.name} sees this screenshot.</p>
        </>
      ) : null}

      {error ? <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
