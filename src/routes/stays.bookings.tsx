import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NewBooking } from "@/components/pms/NewBooking";
import { StayDialog } from "@/components/pms/StayDialog";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { bookingMatches, SOURCE_LABEL, sortBookings, STATUS_LABEL, type BookingFilter } from "@/lib/pms/bookings-logic";
import { shortDay } from "@/lib/pms/dates";
import { folioOf } from "@/lib/pms/folio";
import { openRoomBills } from "@/lib/pms/room-bills";
import type { StaySource, StayStatus } from "@/lib/pms/types";
import { usePms } from "@/lib/pms/use-pms";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";

/** Every booking, searchable and filterable, like a YCS booking list. */
export const Route = createFileRoute("/stays/bookings")({
  head: () => ({ meta: [{ title: "Bookings — XTSY" }, { name: "robots", content: "noindex" }] }),
  component: BookingsPage,
});

const field = "h-10 rounded-xl border border-input bg-card px-3 text-sm";
const STATUS_TONE: Record<StayStatus, string> = {
  booked: "bg-primary-tint text-primary", checked_in: "bg-accent text-accent-foreground", checked_out: "bg-secondary text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive", no_show: "bg-destructive/10 text-destructive",
};

function BookingsPage() {
  const { user } = useStaff();
  const by = user?.displayName ?? "Desk";
  const { types, units, stays, heldOrders } = usePms();
  const [f, setF] = useState<BookingFilter>({ query: "", status: "all", source: "all" });
  const [booking, setBooking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useMemo(() => sortBookings(stays.filter((s) => bookingMatches(s, f))), [stays, f]);
  const opened = stays.find((s) => s.id === openId) ?? null;
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="xt-eyebrow text-primary">Reservations</p><h1 className="text-4xl">Bookings</h1></div>
          <Button onClick={() => setBooking(true)} disabled={!types.length}><Plus className="size-4" />New booking</Button>
        </header>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Search bookings</span>
            <input className={cn(field, "w-full pl-9")} placeholder="Guest, mobile, booking id or reference" value={f.query} onChange={(e) => setF({ ...f, query: e.target.value })} />
          </label>
          <select aria-label="Status" className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as StayStatus | "all" })}>
            <option value="all">Every status</option>{(Object.keys(STATUS_LABEL) as StayStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          <select aria-label="Channel" className={field} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as StaySource | "all" })}>
            <option value="all">Every channel</option>{(Object.keys(SOURCE_LABEL) as StaySource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select>
          <label className="text-xs font-semibold text-muted-foreground">Staying from <input type="date" className={field} value={f.from ?? ""} onChange={(e) => setF({ ...f, ...(e.target.value ? { from: e.target.value } : { from: undefined }) } as BookingFilter)} /></label>
          <label className="text-xs font-semibold text-muted-foreground">to <input type="date" className={field} value={f.to ?? ""} onChange={(e) => setF({ ...f, ...(e.target.value ? { to: e.target.value } : { to: undefined }) } as BookingFilter)} /></label>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Guest</th><th className="px-3 py-2">Stay</th><th className="hidden px-3 py-2 md:table-cell">Rooms</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Due</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((s) => {
                const fo = folioOf(s, types);
                return (
                  <tr key={s.id} className="cursor-pointer hover:bg-secondary/60" onClick={() => setOpenId(s.id)}>
                    <td className="px-3 py-2.5"><span className="font-semibold">{s.guest.name}</span><br /><span className="text-xs text-muted-foreground">{s.reference}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{shortDay(s.checkIn)} → {shortDay(s.checkOut)}<br /><span className="text-xs text-muted-foreground">{fo.nights} night{fo.nights === 1 ? "" : "s"}</span></td>
                    <td className="hidden px-3 py-2.5 md:table-cell">{s.lines.map((l) => `${l.units} × ${types.find((t) => t.id === l.typeId)?.name ?? "room"}`).join(", ")}</td>
                    <td className="px-3 py-2.5">{s.ota ? `${s.ota.name}` : SOURCE_LABEL[s.source]}</td>
                    <td className="px-3 py-2.5"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[s.status])}>{STATUS_LABEL[s.status]}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(fo.total, 0)}</td>
                    <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", fo.due > 0 ? "text-primary" : "text-muted-foreground")}>{fo.due > 0 ? formatINR(fo.due, 0) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length ? <p className="p-8 text-center text-sm text-muted-foreground">{stays.length ? "No booking matches." : "No bookings yet."}</p> : null}
        </div>
        <p className="text-xs text-muted-foreground">{list.length} of {stays.length} bookings</p>
      </div>
      <NewBooking open={booking} onOpenChange={setBooking} types={types} units={units} stays={stays} by={by} onMade={(s) => setOpenId(s.id)} />
      <StayDialog stay={opened} types={types} units={units} roomBills={opened ? openRoomBills(opened, units, heldOrders) : []} by={by} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}
