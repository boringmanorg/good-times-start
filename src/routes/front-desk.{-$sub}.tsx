import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { BedDouble, CalendarDays, Plus, Settings, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DeskCalendar } from "@/components/pms/DeskCalendar";
import { DeskSetup } from "@/components/pms/DeskSetup";
import { Housekeeping } from "@/components/pms/Housekeeping";
import { NewBooking } from "@/components/pms/NewBooking";
import { StayDialog } from "@/components/pms/StayDialog";
import { Segmented } from "@/components/Segmented";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { getDb } from "@/lib/db";
import { addDays, localDate, shortDay } from "@/lib/pms/dates";
import { folioOf } from "@/lib/pms/folio";
import { freeForStay, occupancy } from "@/lib/pms/inventory";
import { deskDay, stayStats } from "@/lib/pms/reports";
import { openRoomBills } from "@/lib/pms/room-bills";
import { formIIIDue } from "@/lib/pms/stay-flow";
import type { Stay } from "@/lib/pms/types";
import { isAdmin, useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { SILENT_PARAMS } from "@/lib/silent-route";

/**
 * Front desk (PMS by XTSY: Hotel / Hostel / Resort POS): today's arrivals and departures,
 * who sleeps where, housekeeping, and the rooms and rates. Works offline like the POS.
 */
export const Route = createFileRoute("/front-desk/{-$sub}")({
  params: SILENT_PARAMS,
  head: () => ({ meta: [{ title: "Front desk — XTSY" }, { name: "robots", content: "noindex" }] }),
  component: FrontDesk,
});

type View = "today" | "calendar" | "housekeeping" | "setup";

function FrontDesk() {
  const { user } = useStaff();
  const admin = isAdmin(user);
  const by = user?.displayName ?? user?.login ?? "Desk";
  const [view, setView] = useState<View>("today");
  const [booking, setBooking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [from, setFrom] = useState(() => localDate());
  const types = useLiveQuery(async () => (await getDb().unitTypes.toArray()).filter((t) => !t.archived).sort((a, b) => a.order - b.order), [], []);
  const units = useLiveQuery(async () => (await getDb().units.toArray()).filter((u) => !u.archived), [], []);
  const stays = useLiveQuery(() => getDb().stays.toArray(), [], [] as Stay[]);
  const orders = useLiveQuery(() => getDb().orders.where("status").equals("held").toArray(), [], []);
  const today = localDate();
  const day = useMemo(() => deskDay(stays, today), [stays, today]);
  const tonight = useMemo(() => stayStats(stays, units, today, addDays(today, 1)), [stays, units, today]);
  const occupiedNow = useMemo(() => new Set(occupancy(stays.filter((s) => s.status === "checked_in"), today, addDays(today, 1)).keys()), [stays, today]);
  const forms = stays.map((s) => formIIIDue(s, Date.now())).filter(Boolean).length;
  const opened = stays.find((s) => s.id === openId) ?? null;
  const freeTonight = types.map((t) => ({ t, free: freeForStay(t, units, stays, today, addDays(today, 1)) }));

  if (!types.length && !admin) return <AppShell><p className="p-6 text-sm text-muted-foreground">The owner or a manager sets up rooms and beds first.</p></AppShell>;

  const views = [
    { value: "today" as const, label: "Today" },
    { value: "calendar" as const, label: "Calendar" },
    { value: "housekeeping" as const, label: "Housekeeping" },
    ...(admin ? [{ value: "setup" as const, label: "Rooms & rates" }] : []),
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl">Front desk</h1>
            <p className="text-sm text-muted-foreground">{shortDay(today)} · {units.length} beds and rooms</p>
          </div>
          <Button onClick={() => setBooking(true)} disabled={!types.length}><Plus className="size-4" />New booking</Button>
        </header>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile label="Arriving today" value={String(day.arrivals.length)} />
          <Tile label="Leaving today" value={String(day.departures.length)} />
          <Tile label="In house" value={String(day.inHouse.length)} />
          <Tile label="Tonight sold" value={`${Math.round(tonight.occupancyPct)}%`} sub={`${tonight.soldNights} of ${tonight.unitNights}`} />
        </div>
        {forms ? <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{forms} foreign guest{forms === 1 ? " needs" : "s need"} Form-III filed. Open the stay to note it.</p> : null}

        <Segmented value={view} onChange={setView} options={views} ariaLabel="Front desk view" />

        {view === "today" ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <List title="Arriving" icon={<CalendarDays className="size-4" />} stays={day.arrivals} empty="No arrivals today." onOpen={(s) => setOpenId(s.id)} types={types} />
            <List title="Leaving" icon={<BedDouble className="size-4" />} stays={day.departures} empty="No departures today." onOpen={(s) => setOpenId(s.id)} types={types} />
            <List title="In house" icon={<Sparkles className="size-4" />} stays={day.inHouse} empty="Nobody is staying yet." onOpen={(s) => setOpenId(s.id)} types={types} />
            <section className="rounded-xl border border-border p-3 lg:col-span-3">
              <p className="mb-2 text-sm font-semibold">Free tonight</p>
              <div className="flex flex-wrap gap-2">
                {freeTonight.map(({ t, free }) => <span key={t.id} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", free ? "bg-secondary" : "bg-destructive/15 text-destructive")}>{t.name}: {free}</span>)}
              </div>
            </section>
          </div>
        ) : null}

        {view === "calendar" ? (
          <>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setFrom(addDays(from, -7))}>Earlier</Button>
              <Button size="sm" variant="outline" onClick={() => setFrom(today)}>Today</Button>
              <Button size="sm" variant="outline" onClick={() => setFrom(addDays(from, 7))}>Later</Button>
            </div>
            <DeskCalendar from={from} days={14} types={types} units={units} stays={stays} onOpen={(s) => setOpenId(s.id)} />
          </>
        ) : null}

        {view === "housekeeping" ? <Housekeeping types={types} units={units} occupied={occupiedNow} /> : null}
        {view === "setup" && admin ? <DeskSetup types={types} units={units} /> : null}
        {view === "setup" && admin && !types.length ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Settings className="size-4" />Add a room type, then its beds or rooms.</p> : null}
      </div>
      <NewBooking open={booking} onOpenChange={setBooking} types={types} units={units} stays={stays} by={by} onMade={(s) => setOpenId(s.id)} />
      <StayDialog stay={opened} types={types} units={units} roomBills={opened ? openRoomBills(opened, units, orders) : []} by={by} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function List({ title, icon, stays, empty, onOpen, types }: { title: string; icon: React.ReactNode; stays: Stay[]; empty: string; onOpen: (s: Stay) => void; types: Parameters<typeof folioOf>[1] }) {
  return (
    <section className="rounded-xl border border-border p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">{icon}{title} · {stays.length}</p>
      {!stays.length ? <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p> : (
        <ul className="space-y-1.5">
          {stays.map((s) => {
            const f = folioOf(s, types);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => onOpen(s)} className="w-full rounded-lg bg-secondary px-3 py-2 text-left hover:bg-raised">
                  <span className="flex justify-between gap-2 text-sm font-semibold"><span className="truncate">{s.guest.name}</span>{f.due > 0 ? <span className="shrink-0 text-warning tabular-nums">{formatINR(f.due, 0)} due</span> : null}</span>
                  <span className="block text-xs text-muted-foreground">{s.lines.map((l) => `${l.units} × ${types.find((t) => t.id === l.typeId)?.name ?? "room"}`).join(", ")} · {shortDay(s.checkIn)} → {shortDay(s.checkOut)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
