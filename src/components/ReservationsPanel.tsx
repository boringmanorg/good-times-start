import { UtensilsCrossed, CalendarClock, Check, Clock, LogIn, ClipboardList, Phone, ReceiptText, Users, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { seatingChoices } from "@/lib/guest-order-logic";
import { placeName } from "@/lib/table-logic";
import { Button } from "./ui/button";
import { useReservations } from "@/lib/use-reservations";
import { isAdmin, useStaff } from "@/lib/staff";
import { can } from "@/lib/permissions";
import { activeReservations, reservationsForDate, type Reservation } from "@/lib/reservations";
import { dayBounds, dateLabel } from "@/lib/orders-history";
import { useNavigate } from "@tanstack/react-router";
import { startReservationOrder } from "@/lib/reservation-actions";
import { playBookingChime, unlockBookingAudio } from "@/lib/booking-alert-audio";

const STATUS_TEXT: Record<string, string> = { pending: "Needs a table", confirmed: "Confirmed", arrived: "Arrived", cancelled: "Cancelled", rejected: "Declined", no_show: "No-show", completed: "Completed" };
/** "Today", "Tomorrow" or "Wed 11 Nov". */
function arrivalDay(at: Date): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(at) - day(new Date())) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : at.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
/** "in 55 min", "in 3 h 10 min", "20 min ago". */
function untilText(at: Date): string {
  const mins = Math.round((at.getTime() - Date.now()) / 60_000);
  const span = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
  if (Math.abs(mins) < 2) return "now";
  if (mins > 0) return mins > 48 * 60 ? `in ${Math.round(mins / 1440)} days` : `in ${span(mins)}`;
  return `${span(-mins)} ago`;
}
/** 919629672541 → +91 96296 72541. */
function phoneText(digits: string): string {
  const d = digits.replace(/\D/g, "");
  const local = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 10 ? d : "";
  return local ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : digits;
}

export interface ReservationsPanelProps extends React.HTMLAttributes<HTMLElement> { date?: string; readOnly?: boolean; upcoming?: boolean; onOpenOrder?: () => void; ref?: React.Ref<HTMLElement> }
/** Staff arrival ledger; reservation state never changes financial settlements or creates kitchen tickets. */
export function ReservationsPanel({ date, readOnly = false, upcoming = false, onOpenOrder, className = "", ref, ...props }: ReservationsPanelProps) {
  const { user } = useStaff();
  const bookings = useReservations();
  const [selectedDate, setSelectedDate] = useState(dateLabel());
  const [busy, setBusy] = useState("");
  // Guests book a party, not a table: staff pick one here.
  const floor = useLiveQuery(() => getDb().restTables.toArray(), []);
  const seats = useMemo(() => seatingChoices(floor ?? []), [floor]);
  const [allotFor, setAllotFor] = useState<Record<string, string>>({});
  // Allotting a table is admin-only (owner or manager); the cloud enforces it too.
  const allot = async (r: Reservation) => {
    const table = allotFor[r.id];
    if (!table || !isAdmin(user)) return;
    setBusy(r.id);
    try { await bookings.allot(r.id, table); toast.success("Table allotted and booking confirmed"); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't allot the table"); } finally { setBusy(""); }
  };
  const navigate = useNavigate();
  const [start, end] = dayBounds(date ?? selectedDate);
  const rows = upcoming ? activeReservations(bookings.rows, Date.now()) : reservationsForDate(bookings.rows, start, end);
  const startOrder = async (r: Reservation) => {
    setBusy(r.id);
    try {
      await startReservationOrder(r);
      onOpenOrder?.();
      if (r.table_id) await navigate({ to: "/", search: { table: r.table_id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open this booking."); } finally { setBusy(""); }
  };
  const change = async (id: string, status: "confirmed" | "arrived" | "cancelled" | "rejected") => {
    setBusy(id);
    try { await bookings.update(id, status); toast.success("Reservation updated"); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update reservation"); } finally { setBusy(""); }
  };
  return <section ref={ref} {...props} aria-label="Guest reservations" className={`mb-7 border-y border-border py-4 ${className}`}>
    <header className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-bold"><CalendarClock className="size-5 text-primary" />Guest reservations</h2><div className="flex flex-wrap items-center gap-2">{!readOnly ? <Button size="sm" variant="outline" onClick={() => { void unlockBookingAudio().then(async (ok) => { if (ok) { await playBookingChime(); toast.success("Booking sound enabled"); } else toast.error("Sound is blocked on this device."); }); }}><Volume2 />Enable sound</Button> : null}{!date && !upcoming ? <input aria-label="Reservation date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-md border border-input bg-card p-2 text-sm" /> : null}</div></header>
    <p className="mb-3 text-xs text-muted-foreground">{bookings.connected ? "Live arrivals" : bookings.at ? `Saved arrivals · ${new Date(bookings.at).toLocaleTimeString("en-IN")}` : "Connecting…"}{bookings.error ? ` · ${bookings.error}` : ""}</p>
    <div className="space-y-3">{rows.map((r) => {
      const at = new Date(r.arrival_at);
      const pending = r.status === "pending";
      const tone = pending ? "bg-warning/15 text-warning" : r.status === "arrived" ? "bg-primary/10 text-primary" : "bg-success/15 text-success";
      const fitting = [...seats].sort((a, b) => Number((a.seats ?? 99) < r.party_size) - Number((b.seats ?? 99) < r.party_size));
      return <article key={r.id} className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${pending ? "border-warning/50" : "border-border"}`}>
        <div className="flex gap-4 p-4">
          <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary px-2 py-3 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{arrivalDay(at)}</span>
            <span className="text-xl font-extrabold tabular-nums leading-tight">{at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).replace(/\s?(am|pm)/i, "")}</span>
            <span className="text-xs font-semibold uppercase text-muted-foreground">{at.getHours() < 12 ? "am" : "pm"}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="break-words text-lg font-bold leading-snug">{r.guest_name}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{STATUS_TEXT[r.status] ?? r.status}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Users className="size-4" />{r.party_size} {r.party_size === 1 ? "guest" : "guests"}</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="size-4" />{untilText(at)}</span>
              {!readOnly && r.guest_phone ? <a href={`tel:+${r.guest_phone}`} className="inline-flex items-center gap-1.5 font-medium text-primary"><Phone className="size-4" />{phoneText(r.guest_phone)}</a> : null}
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm"><UtensilsCrossed className="size-4 text-muted-foreground" />{r.table_label ? <span className="font-semibold">{r.section ? `${r.section} · ` : ""}{placeName(r.table_label)}</span> : <span className="font-semibold text-warning">No table yet</span>}</p>
            {r.note ? <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm"><ClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{r.note}</span></p> : null}
          </div>
        </div>
        {!readOnly && can(user, "guestOrders.handle") && ["pending", "confirmed", "arrived"].includes(r.status) ? <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/40 px-4 py-3">
          {pending && !r.table_id && !isAdmin(user) ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Clock className="size-4" />Waiting for the admin to allot a table</span> : null}
          {pending && !r.table_id && isAdmin(user) ? <>
            <select aria-label="Table for this booking" value={allotFor[r.id] ?? ""} onChange={(e) => setAllotFor((m) => ({ ...m, [r.id]: e.target.value }))} className="h-10 min-w-44 flex-1 rounded-lg border border-input bg-card px-3 text-sm">
              <option value="">Choose a table for {r.party_size}…</option>
              {fitting.map((t) => <option key={t.id} value={t.id}>{placeName(t.label)}{t.seats ? ` · ${t.seats} seats` : ""}{t.seats && t.seats < r.party_size ? " (too small)" : ""}{t.busy ? " · in use now" : ""}</option>)}
            </select>
            <Button disabled={!!busy || !bookings.connected || !allotFor[r.id]} onClick={() => void allot(r)}><Check />Allot & confirm</Button>
          </> : null}
          {pending && r.table_id ? <Button disabled={!!busy || !bookings.connected} onClick={() => void change(r.id, "confirmed")}><Check />Confirm</Button> : null}
          {r.status === "confirmed" ? <Button disabled={!!busy || !bookings.connected} onClick={() => void change(r.id, "arrived")}><LogIn />Guest arrived</Button> : null}
          {["confirmed", "arrived"].includes(r.status) && can(user, "bill.create") ? <Button variant="outline" disabled={!!busy} onClick={() => void startOrder(r)}><ReceiptText />Start order</Button> : null}
          <span className="ml-auto" />
          {pending ? <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={!!busy || !bookings.connected} onClick={() => void change(r.id, "rejected")}><X />Decline</Button>
            : <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={!!busy || !bookings.connected} onClick={() => void change(r.id, "cancelled")}><X />Cancel booking</Button>}
        </div> : null}
      </article>;
    })}{!rows.length ? <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No table bookings{upcoming ? " coming up" : " for this date"}.</p> : null}</div>
  </section>;
}