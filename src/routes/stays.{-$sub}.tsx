import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, BedDouble, CalendarCheck, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NewBooking } from "@/components/pms/NewBooking";
import { StayDialog } from "@/components/pms/StayDialog";
import { StayInsights } from "@/components/pms/StayInsights";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { SOURCE_LABEL } from "@/lib/pms/bookings-logic";
import { addDays, localDate, shortDay } from "@/lib/pms/dates";
import { HOLDS_NIGHTS } from "@/lib/pms/inventory";
import { deskDay, stayStats } from "@/lib/pms/reports";
import { openRoomBills } from "@/lib/pms/room-bills";
import { formIIIDue } from "@/lib/pms/stay-flow";
import { usePms } from "@/lib/pms/use-pms";
import { useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { SILENT_PARAMS, silent } from "@/lib/silent-route";

/** Hostel / Hotel / Resort POS home: the property at a glance, like a YCS dashboard. */
export const Route = createFileRoute("/stays/{-$sub}")({
  params: SILENT_PARAMS,
  head: () => ({ meta: [{ title: "Property dashboard — XTSY" }, { name: "robots", content: "noindex" }] }),
  component: StaysDashboard,
});

function StaysDashboard() {
  const { user } = useStaff();
  const by = user?.displayName ?? "Desk";
  const { types, units, stays, heldOrders } = usePms();
  const [booking, setBooking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = localDate();
  const monthStart = `${today.slice(0, 8)}01`;
  const day = useMemo(() => deskDay(stays, today), [stays, today]);
  const tonight = useMemo(() => stayStats(stays, units, today, addDays(today, 1)), [stays, units, today]);
  const month = useMemo(() => stayStats(stays, units, monthStart, addDays(today, 1)), [stays, units, monthStart, today]);
  const ahead = useMemo(() => Array.from({ length: 14 }, (_, i) => { const n = addDays(today, i); return { night: n, ...stayStats(stays, units, n, addDays(n, 1)) }; }), [stays, units, today]);
  const unassigned = stays.filter((s) => s.status === "booked" && s.lines.some((l) => l.unitIds.length < l.units) && s.checkIn <= addDays(today, 2));
  const forms = stays.filter((s) => formIIIDue(s, Date.now()));
  const dirty = units.filter((u) => u.housekeeping === "dirty").length;
  const recent = [...stays].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const opened = stays.find((s) => s.id === openId) ?? null;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="xt-eyebrow text-primary">Property dashboard</p>
            <h1 className="text-4xl">{user?.restaurantName || "Your property"}</h1>
            <p className="text-sm text-muted-foreground">{shortDay(today)} · {units.length} beds and rooms · {types.length} room types</p>
          </div>
          <Button onClick={() => setBooking(true)} disabled={!types.length}><Plus className="size-4" />New booking</Button>
        </header>

        {!types.length ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="font-semibold">Set up your rooms first</p>
            <p className="mt-1 text-sm text-muted-foreground">Add room and bed types with their rates, then the beds and rooms of each.</p>
            <Link to="/stays/property/{-$sub}" className="mt-3 inline-block font-semibold text-primary">Open Property →</Link>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Arriving today" value={day.arrivals.length} />
          <Kpi label="Leaving today" value={day.departures.length} />
          <Kpi label="In house" value={day.inHouse.length} />
          <Kpi label="Tonight" value={`${Math.round(tonight.occupancyPct)}%`} sub={`${tonight.soldNights} of ${tonight.unitNights} sold`} />
          <Kpi label="Room revenue · month" value={formatINR(month.roomRevenue, 0)} sub="before GST" />
          <Kpi label="Average rate · month" value={formatINR(month.adr, 0)} sub={`RevPAR ${formatINR(month.revpar, 0)}`} />
        </div>

        <StayInsights types={types} units={units} stays={stays} today={today} />

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
            <div className="flex items-baseline justify-between"><h2 className="text-2xl">Next 14 nights</h2><Link to="/stays/rates/{-$sub}" className="text-sm font-semibold text-primary">Rates & availability →</Link></div>
            <div className="mt-4 flex h-40 items-end gap-1.5" role="img" aria-label="Occupancy for the next 14 nights">
              {ahead.map((d) => (
                <div key={d.night} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{Math.round(d.occupancyPct)}%</span>
                  <div className="flex h-28 w-full items-end rounded-md bg-secondary"><div className="w-full rounded-md bg-primary" style={{ height: `${Math.max(2, d.occupancyPct)}%` }} /></div>
                  <span className="text-[10px] text-muted-foreground">{shortDay(d.night).split(",")[0]?.slice(0, 3)} {d.night.slice(8)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-2xl">Needs attention</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <Attention show={unassigned.length > 0} tone="warn" text={`${unassigned.length} booking${unassigned.length === 1 ? "" : "s"} arriving soon without beds or rooms`} to="/front-desk" />
              <Attention show={forms.length > 0} tone="bad" text={`${forms.length} foreign guest${forms.length === 1 ? "" : "s"}: Form-III to file`} to="/front-desk" />
              <Attention show={dirty > 0} tone="warn" text={`${dirty} bed${dirty === 1 ? "" : "s"} or room${dirty === 1 ? "" : "s"} to clean`} to="/front-desk" />
              <Attention show={day.departures.length > 0} tone="info" text={`${day.departures.length} check-out${day.departures.length === 1 ? "" : "s"} due today`} to="/front-desk" />
              {!unassigned.length && !forms.length && !dirty && !day.departures.length ? <li className="text-muted-foreground">All clear.</li> : null}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between"><h2 className="text-2xl">Latest bookings</h2><Link to="/stays/bookings/{-$sub}" className="text-sm font-semibold text-primary">All bookings →</Link></div>
          <ul className="mt-3 divide-y divide-border">
            {recent.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setOpenId(s.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-left text-sm hover:bg-secondary/60">
                  <span className="min-w-40 flex-1 font-semibold">{s.guest.name}</span>
                  <span className="text-muted-foreground">{shortDay(s.checkIn)} → {shortDay(s.checkOut)}</span>
                  <span className="text-muted-foreground">{s.ota ? s.ota.name : SOURCE_LABEL[s.source]}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", HOLDS_NIGHTS(s) ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground")}>{s.status === "checked_in" ? "In house" : s.status === "booked" ? "Confirmed" : s.status.replace("_", " ")}</span>
                </button>
              </li>
            ))}
            {!recent.length ? <li className="py-6 text-center text-sm text-muted-foreground"><CalendarCheck className="mx-auto mb-1 size-5" />No bookings yet.</li> : null}
          </ul>
        </section>
      </div>
      <NewBooking open={booking} onOpenChange={setBooking} types={types} units={units} stays={stays} by={by} onMade={(s) => setOpenId(s.id)} />
      <StayDialog stay={opened} types={types} units={units} roomBills={opened ? openRoomBills(opened, units, heldOrders) : []} by={by} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Attention({ show, tone, text, to }: { show: boolean; tone: "bad" | "warn" | "info"; text: string; to: "/front-desk" }) {
  if (!show) return null;
  return (
    <li>
      <Link to={silent(to)} className={cn("flex items-start gap-2 rounded-xl px-3 py-2", tone === "bad" ? "bg-destructive/10 text-destructive" : tone === "warn" ? "bg-primary-tint text-primary" : "bg-accent text-accent-foreground")}>
        {tone === "info" ? <BedDouble className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}<span>{text}</span>
      </Link>
    </li>
  );
}
