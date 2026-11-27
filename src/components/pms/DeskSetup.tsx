import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { addUnits, saveUnitType } from "@/lib/pms/actions";
import { stayGstPct } from "@/lib/pms/folio";
import { byLabel } from "@/lib/pms/inventory";
import { expandLabels } from "@/lib/pms/setup-logic";
import type { SoldAs, Unit, UnitType } from "@/lib/pms/types";

const field = "mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";

/** Owner/manager: room and bed types with their rates, and the beds and rooms of each. */
export function DeskSetup({ types, units }: { types: UnitType[]; units: Unit[] }) {
  const [t, setT] = useState({ name: "", soldAs: "bed" as SoldAs, rate: 500, maxGuests: 2, femaleOnly: false });
  const [u, setU] = useState({ typeId: "", room: "", labels: "" });
  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    try { await fn(); toast.success(ok); after?.(); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  const preview = expandLabels(u.labels);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border p-4">
        <p className="font-semibold">Room and bed types</p>
        <ul className="mt-2 divide-y divide-border">
          {types.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{x.name}{x.descriptor ? <span className="text-muted-foreground"> · {x.descriptor}</span> : null}{x.femaleOnly ? " · women only" : ""}<br /><span className="text-xs text-muted-foreground">{units.filter((v) => v.typeId === x.id).length} {x.soldAs === "bed" ? "beds" : "rooms"} · GST {stayGstPct(x.rate, x.gst)}%{x.engineRef ? " · from the booking engine" : ""}{x.channelRef ? ` · channel id ${x.channelRef}` : ""}</span></span>
              <span className="tabular-nums">{formatINR(x.rate, 0)}/night</span>
            </li>
          ))}
          {!types.length ? <li className="py-2 text-sm text-muted-foreground">Add your first room or bed type.</li> : null}
        </ul>
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">Name<input className={field} placeholder="Bed in 6 Bed Mixed Dormitory" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></label>
          <label className="text-xs font-semibold text-muted-foreground">Sold as<select className={field} value={t.soldAs} onChange={(e) => setT({ ...t, soldAs: e.target.value as SoldAs })}><option value="bed">A bed in a dorm</option><option value="room">A whole room</option></select></label>
          <label className="text-xs font-semibold text-muted-foreground">₹ per night (before GST)<input type="number" min={0} className={field} value={t.rate} onChange={(e) => setT({ ...t, rate: Number(e.target.value) || 0 })} /></label>
          {t.soldAs === "room" ? <label className="text-xs font-semibold text-muted-foreground">Guests per room<input type="number" min={1} max={20} className={field} value={t.maxGuests} onChange={(e) => setT({ ...t, maxGuests: Number(e.target.value) || 1 })} /></label> : null}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.femaleOnly} onChange={(e) => setT({ ...t, femaleOnly: e.target.checked })} />Women only</label>
          <p className="text-xs text-muted-foreground sm:col-span-2">GST {stayGstPct(t.rate)}% at this rate: nil up to ₹1,000 a night, 5% up to ₹7,500, 18% above.</p>
          <Button className="sm:col-span-2" onClick={() => void run(() => saveUnitType({ ...t, gst: "auto" }), "Room type added", () => setT({ ...t, name: "" }))}>Add room type</Button>
        </div>
      </section>

      <section className="rounded-xl border border-border p-4">
        <p className="font-semibold">Beds and rooms</p>
        <div className="mt-2 space-y-1 text-sm">
          {types.map((x) => {
            const list = units.filter((v) => v.typeId === x.id).sort(byLabel);
            return list.length ? <p key={x.id}><span className="text-muted-foreground">{x.name}:</span> {list.map((v) => v.label).join(", ")}</p> : null;
          })}
        </div>
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">Type<select className={field} value={u.typeId} onChange={(e) => setU({ ...u, typeId: e.target.value })}>
            <option value="">Choose…</option>{types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-muted-foreground">Room (for dorm beds)<input className={field} placeholder="Room 8" value={u.room} onChange={(e) => setU({ ...u, room: e.target.value })} /></label>
          <label className="text-xs font-semibold text-muted-foreground">Labels<input className={field} placeholder="8A-8H  or  11, 12, 14" value={u.labels} onChange={(e) => setU({ ...u, labels: e.target.value })} /></label>
          {preview.length ? <p className="text-xs text-muted-foreground sm:col-span-2">Adds {preview.length}: {preview.join(", ")}</p> : null}
          <Button className="sm:col-span-2" disabled={!u.typeId || !preview.length} onClick={() => void run(() => addUnits(u.typeId, u.room, preview), `${preview.length} added`, () => setU({ ...u, labels: "" }))}>Add</Button>
        </div>
      </section>
    </div>
  );
}
