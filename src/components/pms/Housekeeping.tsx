import { toast } from "sonner";
import { setHousekeeping } from "@/lib/pms/actions";
import { byLabel } from "@/lib/pms/inventory";
import type { Housekeeping as HkState, Unit, UnitType } from "@/lib/pms/types";
import { cn } from "@/lib/utils";

const STATES: { v: HkState; l: string; c: string }[] = [
  { v: "clean", l: "Clean", c: "bg-success/20 text-success" },
  { v: "dirty", l: "Dirty", c: "bg-gold/20 text-warning" },
  { v: "inspect", l: "Inspect", c: "bg-white/15 text-foreground" },
  { v: "out_of_order", l: "Out of order", c: "bg-destructive/20 text-destructive" },
];

/** Every bed and room with its housekeeping state; one tap changes it. */
export function Housekeeping({ types, units, occupied }: { types: UnitType[]; units: Unit[]; occupied: Set<string> }) {
  const set = async (u: Unit, v: HkState) => {
    const note = v === "out_of_order" ? window.prompt(`Why is ${u.label} out of order?`) ?? "" : undefined;
    if (v === "out_of_order" && !note?.trim()) return;
    try { await setHousekeeping(u.id, v, note); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  const dirty = units.filter((u) => u.housekeeping === "dirty").length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{dirty ? `${dirty} to clean.` : "Everything is clean."} Beds and rooms turn dirty when a guest checks out.</p>
      {types.map((t) => {
        const rows = units.filter((u) => u.typeId === t.id).sort(byLabel);
        if (!rows.length) return null;
        return (
          <section key={t.id}>
            <p className="mb-2 text-xs font-bold text-muted-foreground">{t.name}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {rows.map((u) => (
                <div key={u.id} className="rounded-xl border border-border bg-card p-2">
                  <p className="flex items-center justify-between text-sm font-bold">{u.label}{occupied.has(u.id) ? <span className="text-[11px] font-semibold text-success">Guest in</span> : null}</p>
                  {u.note ? <p className="truncate text-[11px] text-muted-foreground">{u.note}</p> : null}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {STATES.map((s) => (
                      <button key={s.v} type="button" onClick={() => void set(u, s.v)} aria-pressed={u.housekeeping === s.v}
                        className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", u.housekeeping === s.v ? s.c : "text-muted-foreground hover:bg-secondary")}>{s.l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
