import { addDays, nightsOf, shortDay } from "@/lib/pms/dates";
import { byLabel, occupancy } from "@/lib/pms/inventory";
import type { IsoDate, Stay, Unit, UnitType } from "@/lib/pms/types";
import { cn } from "@/lib/utils";

const HK: Record<Unit["housekeeping"], string> = { clean: "bg-success", dirty: "bg-gold", inspect: "bg-white", out_of_order: "bg-destructive" };

/** Beds and rooms down the side, nights across: who sleeps where. Tap a stay to open it. */
export function DeskCalendar({ from, days, types, units, stays, onOpen }: {
  from: IsoDate; days: number; types: UnitType[]; units: Unit[]; stays: Stay[]; onOpen: (s: Stay) => void;
}) {
  const to = addDays(from, days);
  const nights = nightsOf(from, to);
  const occ = occupancy(stays, from, to);
  const byId = new Map(stays.map((s) => [s.id, s]));
  const unassigned = stays.filter((s) => s.status === "booked" && s.lines.some((l) => l.unitIds.length < l.units) && s.checkIn < to && s.checkOut > from);
  return (
    <div className="space-y-3">
      {unassigned.length ? (
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
          <p className="font-semibold text-warning">Waiting for beds or rooms</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {unassigned.map((s) => <button key={s.id} type="button" onClick={() => onOpen(s)} className="rounded-lg bg-card px-2 py-1 text-xs font-semibold">{s.guest.name} · {shortDay(s.checkIn)}</button>)}
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-secondary">
              <th className="sticky left-0 z-10 bg-secondary px-2 py-2 text-left font-semibold">Bed / room</th>
              {nights.map((n) => <th key={n} className="min-w-16 px-1 py-2 text-center font-semibold">{shortDay(n)}</th>)}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const rows = units.filter((u) => u.typeId === t.id).sort(byLabel);
              if (!rows.length) return null;
              return [
                <tr key={`h-${t.id}`}><td colSpan={nights.length + 1} className="bg-card px-2 pb-1 pt-3 text-[11px] font-bold text-muted-foreground">{t.name}</td></tr>,
                ...rows.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-background px-2 py-1.5 font-semibold">
                      <span className={cn("mr-1.5 inline-block size-2 rounded-full", HK[u.housekeeping])} aria-label={u.housekeeping} />{u.label}
                    </td>
                    {nights.map((n, i) => {
                      const sid = occ.get(u.id)?.get(n);
                      const s = sid ? byId.get(sid) : undefined;
                      const starts = s && (s.checkIn === n || i === 0);
                      return (
                        <td key={n} className="p-0.5">
                          {s ? (
                            <button type="button" onClick={() => onOpen(s)} title={`${s.guest.name} · ${s.reference}`}
                              className={cn("block h-7 w-full truncate rounded-md px-1 text-left text-[11px] font-semibold",
                                s.status === "checked_in" ? "bg-success/25 text-success" : "bg-primary/20 text-primary")}>
                              {starts ? s.guest.name.split(" ")[0] : ""}
                            </button>
                          ) : <div className={cn("h-7 rounded-md", u.housekeeping === "out_of_order" ? "bg-destructive/15" : "bg-secondary/40")} />}
                        </td>
                      );
                    })}
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="mr-3"><span className="mr-1 inline-block size-2 rounded-full bg-success" />Clean</span>
        <span className="mr-3"><span className="mr-1 inline-block size-2 rounded-full bg-gold" />Dirty</span>
        <span className="mr-3"><span className="mr-1 inline-block size-2 rounded-full bg-white" />Inspect</span>
        <span><span className="mr-1 inline-block size-2 rounded-full bg-destructive" />Out of order</span>
      </p>
    </div>
  );
}
