import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatINR } from "@/lib/billing";
import { addCharge, addPayment, assignUnits, cancelStay, checkIn, checkOut, markNoShow, recordFormIII } from "@/lib/pms/actions";
import { localDate, shortDay } from "@/lib/pms/dates";
import { folioOf } from "@/lib/pms/folio";
import { canCheckIn, canCheckOut, formIIIDue } from "@/lib/pms/stay-flow";
import type { PayMode, Stay, Unit, UnitType } from "@/lib/pms/types";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";

const field = "mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";
const STATUS: Record<Stay["status"], { l: string; c: string }> = {
  booked: { l: "Booked", c: "bg-primary/15 text-primary" },
  checked_in: { l: "In house", c: "bg-success/15 text-success" },
  checked_out: { l: "Checked out", c: "bg-secondary text-muted-foreground" },
  cancelled: { l: "Cancelled", c: "bg-destructive/15 text-destructive" },
  no_show: { l: "No-show", c: "bg-destructive/15 text-destructive" },
};
const ID_KINDS = ["Aadhaar", "Passport", "Driving licence", "Voter ID", "PAN"];
const MODES: { v: PayMode; l: string }[] = [{ v: "upi", l: "UPI" }, { v: "cash", l: "Cash" }, { v: "card", l: "Card" }, { v: "bank", l: "Bank transfer" }, { v: "ota_collect", l: "Paid on booking site" }];

/** One stay: guest, beds/rooms, the folio, and the next step (check in, take payment, check out). */
export function StayDialog({ stay, types, units, roomBills, by, onClose }: {
  stay: Stay | null; types: UnitType[]; units: Unit[]; roomBills: Order[]; by: string; onClose: () => void;
}) {
  const [idSeen, setIdSeen] = useState("");
  const [nationality, setNationality] = useState("IN");
  const [pay, setPay] = useState<{ amount: number | ""; mode: PayMode; kind: "payment" | "refund" }>({ amount: "", mode: "upi", kind: "payment" });
  const [charge, setCharge] = useState<{ label: string; amount: number | ""; gst: number }>({ label: "", amount: "", gst: 18 });
  const [reason, setReason] = useState("");
  const [formRef, setFormRef] = useState("");
  if (!stay) return null;
  const folio = folioOf(stay, types);
  const today = localDate();
  const guestReady = { ...stay, guest: { ...stay.guest, ...(idSeen ? { idSeen } : {}), nationality } };
  const checkInWhy = stay.status === "booked" ? canCheckIn(guestReady, units, today) : null;
  const checkOutWhy = stay.status === "checked_in" ? canCheckOut(stay, types, roomBills.length) : null;
  const form = formIIIDue(stay, Date.now());
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  const label = (id: string) => units.find((u) => u.id === id)?.label ?? "?";
  const open = stay.status === "booked" || stay.status === "checked_in";

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogTitle className="flex flex-wrap items-center gap-2">
          {stay.guest.name}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[stay.status].c)}>{STATUS[stay.status].l}</span>
        </DialogTitle>
        <p className="-mt-2 text-sm text-muted-foreground">
          {stay.reference} · {shortDay(stay.checkIn)} → {shortDay(stay.checkOut)} · {folio.nights} night{folio.nights === 1 ? "" : "s"} · {stay.guest.phone}
          {stay.ota ? ` · ${stay.ota.name} ${stay.ota.bookingId}` : ""}
        </p>

        {form ? (
          <div className={cn("rounded-xl border p-3 text-sm", form.overdue ? "border-destructive/50 bg-destructive/10" : "border-gold/50 bg-gold/10")}>
            <p className="font-semibold">Foreign guest: file Form-III within 24 hours of arrival</p>
            <p className="text-xs text-muted-foreground">On indianfrro.gov.in. Due by {new Date(form.dueAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.</p>
            <div className="mt-2 flex gap-2"><input className={cn(field, "mt-0")} placeholder="Form-III reference (optional)" value={formRef} onChange={(e) => setFormRef(e.target.value)} />
              <Button onClick={() => void run(() => recordFormIII(stay.id, formRef, by), "Form-III noted")}>Filed</Button></div>
          </div>
        ) : null}

        <section className="space-y-2">
          <p className="text-sm font-semibold">Beds and rooms</p>
          {stay.lines.map((l, i) => {
            const t = types.find((x) => x.id === l.typeId);
            return (
              <div key={`${l.typeId}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary p-3 text-sm">
                <span className="min-w-0 flex-1">{t?.name ?? "Room"} × {l.units} · {formatINR(l.rate, 0)}/night</span>
                {l.unitIds.map((id) => <span key={id} className="rounded-md bg-card px-2 py-1 font-semibold">{label(id)}</span>)}
                {open && l.unitIds.length < l.units ? <Button size="sm" variant="outline" onClick={() => void run(() => assignUnits(stay.id, i, "auto"), "Beds given")}>Give {t?.soldAs === "bed" ? "beds" : "rooms"}</Button> : null}
              </div>
            );
          })}
        </section>

        <section className="rounded-xl border border-border p-3 text-sm">
          <p className="mb-1 font-semibold">Folio</p>
          {folio.lines.map((l, i) => <p key={i} className="flex justify-between gap-3"><span>{l.label}{l.gstPct ? ` · GST ${l.gstPct}%` : ""}</span><span className="tabular-nums">{formatINR(l.taxable + l.gst, 2)}</span></p>)}
          <p className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatINR(folio.total, 0)}</span></p>
          {stay.payments.map((p) => <p key={p.id} className="flex justify-between text-muted-foreground"><span>{p.kind === "refund" ? "Refund" : p.kind === "advance" ? "Advance" : "Paid"} · {MODES.find((m) => m.v === p.mode)?.l}</span><span className="tabular-nums">{p.kind === "refund" ? "+" : "−"}{formatINR(p.amount, 0)}</span></p>)}
          <p className={cn("mt-1 flex justify-between font-bold", folio.due > 0 ? "text-warning" : "text-success")}><span>{folio.due >= 0 ? "Due" : "To refund"}</span><span className="tabular-nums">{formatINR(Math.abs(folio.due), 0)}</span></p>
          {roomBills.length ? <p className="mt-2 rounded-lg bg-gold/10 px-2 py-1 text-xs text-warning">{roomBills.length} restaurant bill{roomBills.length === 1 ? "" : "s"} open on the room ({formatINR(roomBills.reduce((s, o) => s + (o.total ?? 0), 0), 0)}): settle at POS Billdesk.</p> : null}
        </section>

        {open ? (
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">Take a payment</p>
              <div className="mt-1 flex gap-2">
                <input type="number" min={0} className={field} placeholder={folio.due > 0 ? String(folio.due) : "Amount"} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value === "" ? "" : Number(e.target.value) })} />
                <select className={field} value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value as PayMode })}>{MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select>
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => void run(() => addPayment(stay.id, { kind: "payment", amount: Number(pay.amount || folio.due), mode: pay.mode }, by), "Payment recorded").then(() => setPay({ ...pay, amount: "" }))}>Record payment</Button>
                {folio.due < 0 ? <Button size="sm" variant="outline" onClick={() => void run(() => addPayment(stay.id, { kind: "refund", amount: -folio.due, mode: pay.mode }, by), "Refund recorded")}>Record refund</Button> : null}
              </div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">Add a charge</p>
              <input className={field} placeholder="Laundry, bike rental, late check-out…" value={charge.label} onChange={(e) => setCharge({ ...charge, label: e.target.value })} />
              <div className="mt-1 flex gap-2">
                <input type="number" min={0} className={field} placeholder="₹ before GST" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value === "" ? "" : Number(e.target.value) })} />
                <select className={field} value={charge.gst} onChange={(e) => setCharge({ ...charge, gst: Number(e.target.value) })}>{[0, 5, 12, 18].map((g) => <option key={g} value={g}>GST {g}%</option>)}</select>
              </div>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void run(() => addCharge(stay.id, charge.label, Number(charge.amount), charge.gst, by), "Charge added").then(() => setCharge({ label: "", amount: "", gst: 18 }))}>Add</Button>
            </div>
          </section>
        ) : null}

        {stay.status === "booked" ? (
          <section className="space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">Check in</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">ID seen
                <select className={field} value={idSeen || stay.guest.idSeen || ""} onChange={(e) => setIdSeen(e.target.value)}>
                  <option value="">Choose…</option>{ID_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className="text-xs font-semibold text-muted-foreground">Nationality
                <select className={field} value={nationality} onChange={(e) => setNationality(e.target.value)}>
                  <option value="IN">Indian</option><option value="XX">Foreign national</option></select></label>
            </div>
            {checkInWhy ? <p className="text-xs text-warning">{checkInWhy}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!!checkInWhy} onClick={() => void run(() => checkIn(stay.id, { ...(idSeen ? { idSeen } : {}), nationality }, by), "Checked in")}>Check in</Button>
              {stay.checkIn < today ? <Button variant="outline" onClick={() => void run(() => markNoShow(stay.id), "Marked no-show")}>No-show</Button> : null}
            </div>
            <div className="flex gap-2 border-t border-border pt-2">
              <input className={cn(field, "mt-0")} placeholder="Reason to cancel" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="outline" onClick={() => void run(() => cancelStay(stay.id, reason, by), "Booking cancelled")}>Cancel booking</Button>
            </div>
          </section>
        ) : null}

        {stay.status === "checked_in" ? (
          <section className="rounded-xl border border-border p-3">
            {checkOutWhy ? <p className="mb-2 text-xs text-warning">{checkOutWhy}</p> : <p className="mb-2 text-xs text-muted-foreground">All settled. Beds and rooms go to housekeeping after check-out.</p>}
            <Button disabled={!!checkOutWhy} onClick={() => void run(() => checkOut(stay.id, roomBills.length, by), "Checked out").then(onClose)}>Check out</Button>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
