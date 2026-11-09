import { CalendarClock, Check, X, LogIn, ReceiptText, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db";
import { seatingChoices } from "@/lib/guest-order-logic";
import { placeName } from "@/lib/table-logic";
import { Button } from "./ui/button";
import { useReservations } from "@/lib/use-reservations";
import { useStaff } from "@/lib/auth-context";
import { can } from "@/lib/permissions";
import { activeReservations, reservationsForDate, type Reservation } from "@/lib/reservations";
import { dayBounds, dateLabel } from "@/lib/orders-history";
import { useNavigate } from "@tanstack/react-router";
import { startReservationOrder } from "@/lib/reservation-actions";
import { playBookingChime, unlockBookingAudio } from "@/lib/booking-alert-audio";

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
  const allot = async (r: Reservation) => {
    const table = allotFor[r.id];
    if (!table) return;
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
    <div className="divide-y divide-border">{rows.map((r) => <article key={r.id} className="flex flex-wrap items-center gap-3 py-3">
      <span className="w-20 font-bold tabular-nums">{upcoming ? <span className="block text-xs text-muted-foreground">{new Date(r.arrival_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span> : null}{new Date(r.arrival_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      <div className="min-w-0 flex-1"><h3 className="break-words text-lg font-bold">{r.table_label ? `${r.section ? `${r.section} · ` : ""}${r.table_label}` : "Table to allot"}</h3><p className="text-base font-semibold">{r.guest_name} · {r.party_size} guests</p><p className={r.status === "pending" ? "text-sm font-semibold text-warning" : "text-sm font-semibold text-success"}>{r.status === "pending" ? "Awaiting allotment" : r.status === "confirmed" ? "Table allotted" : r.status === "arrived" ? "Arrived" : r.status}</p>{!readOnly ? <p className="text-sm text-muted-foreground">{r.guest_phone}</p> : null}{r.note ? <p className="mt-1 rounded-lg bg-secondary px-2 py-1 text-sm">“{r.note}”</p> : null}</div>
      {!readOnly && can(user, "guestOrders.handle") ? <div className="flex flex-wrap gap-2">
        {r.status === "pending" && !r.table_id ? <>
          <select aria-label="Table for this booking" value={allotFor[r.id] ?? ""} onChange={(e) => setAllotFor((m) => ({ ...m, [r.id]: e.target.value }))} className="h-10 rounded-lg border border-input bg-card px-2 text-sm">
            <option value="">Choose a table…</option>
            {seats.map((t) => <option key={t.id} value={t.id}>{placeName(t.label)}{t.seats ? ` · ${t.seats} seats` : ""}{t.seats && t.seats < r.party_size ? " (small)" : ""}</option>)}
          </select>
          <Button disabled={!!busy || !bookings.connected || !allotFor[r.id]} onClick={() => void allot(r)}><Check />Allot & confirm</Button>
        </> : null}
        {r.status === "pending" && r.table_id ? <Button disabled={!!busy || !bookings.connected} onClick={() => void change(r.id, "confirmed")}><Check />Accept & allot</Button> : null}
        {r.status === "pending" ? <Button variant="outline" disabled={!!busy || !bookings.connected} onClick={() => void change(r.id, "rejected")}><X />Decline</Button> : null}
        {r.status === "confirmed" ? <Button size="sm" disabled={!!busy || !bookings.connected} onClick={() => void change(r.id, "arrived")}><LogIn />Arrived</Button> : null}
        {["confirmed", "arrived"].includes(r.status) && can(user, "bill.create") ? <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void startOrder(r)}><ReceiptText />Start order</Button> : null}
        {["pending", "confirmed", "arrived"].includes(r.status) ? <Button size="sm" variant="ghost" disabled={!!busy || !bookings.connected} onClick={() => void change(r.id, "cancelled")}><X />Cancel</Button> : null}
      </div> : null}
    </article>)}{!rows.length ? <p className="py-3 text-sm text-muted-foreground">No guest reservations for this date.</p> : null}</div>
  </section>;
}