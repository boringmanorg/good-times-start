import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/Dropdown";
import { getDb, markDirty } from "@/lib/db";
import { newUid } from "@/lib/sync-core";
import { GST_RATES, applyBulkPatch, commonAddons, type BulkMenuPatch } from "@/lib/menu-logic";
import type { GstRate, MenuItem } from "@/lib/types";

const inputClass = "mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm";
const KEEP = "keep";

export function MenuBulkEdit({ items, menu, categories, stations, onDone }: {
  items: MenuItem[];
  menu: MenuItem[];
  categories: string[];
  stations: string[];
  onDone: () => void;
}) {
  const [category, setCategory] = useState("");
  const [station, setStation] = useState("");
  const [gst, setGst] = useState<string>(KEEP);
  const [adds, setAdds] = useState<{ id: string; name: string; price: string }[]>([]);
  const [removes, setRemoves] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const common = useMemo(() => commonAddons(menu), [menu]);
  const selectedAddonNames = useMemo(() => commonAddons(items).map((a) => a.name), [items]);

  const addRow = (name = "", price = "") => setAdds((rows) => [...rows, { id: newUid().slice(0, 8), name, price }]);

  const save = async () => {
    const bad = adds.find((a) => a.name.trim() && !(Number(a.price) >= 0 && a.price.trim() !== ""));
    if (bad) { toast.error(`Enter a price for ${bad.name} (0 is fine)`); return; }
    const patch: BulkMenuPatch = {
      category: category.trim() || undefined,
      station: station.trim() || undefined,
      gstRate: gst === KEEP ? undefined : (Number(gst) as GstRate),
      upsertAddons: adds.filter((a) => a.name.trim()).map((a) => ({ name: a.name, price: Number(a.price) })),
      removeAddons: removes,
    };
    if (!patch.category && !patch.station && patch.gstRate === undefined && !patch.upsertAddons?.length && !removes.length) {
      toast.error("Choose at least one change"); return;
    }
    setSaving(true);
    try {
      const next = items.map((m) => applyBulkPatch(m, patch, () => newUid().slice(0, 8)));
      await getDb().menu.bulkPut(next);
      await markDirty(...next.map((m): ["menu", string] => ["menu", m.id]));
      toast.success(`Updated ${next.length} dish${next.length === 1 ? "" : "es"}`);
      onDone();
    } catch {
      toast.error("Could not update the dishes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Changing {items.length} dish{items.length === 1 ? "" : "es"}. Leave a field blank to keep what each dish has.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-medium">Category
          <input list="bulk-categories" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Keep current" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Kitchen station
          <input list="bulk-stations" maxLength={40} value={station} onChange={(e) => setStation(e.target.value)} placeholder="Keep current" className={inputClass} />
        </label>
        <div className="text-sm font-medium">GST
          <Dropdown<string> ariaLabel="GST rate" className="mt-1" value={gst} onChange={setGst}
            options={[{ value: KEEP, label: "Keep current" }, ...GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))]} />
        </div>
      </div>
      <datalist id="bulk-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="bulk-stations">{stations.map((s) => <option key={s} value={s} />)}</datalist>

      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold">Add or change add-ons</legend>
        <p className="text-xs text-muted-foreground">Added to every selected dish. If a dish already has one with the same name, its price is updated.</p>
        {common.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {common.slice(0, 12).map((a) => (
              <Button key={a.name} type="button" size="sm" variant="outline" disabled={adds.some((r) => r.name.trim().toLowerCase() === a.name.toLowerCase())}
                onClick={() => addRow(a.name, String(a.price))}><Plus />{a.name} ₹{a.price}</Button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 space-y-2">
          {adds.map((row, i) => (
            <div key={row.id} className="flex gap-2">
              <input aria-label="Add-on name" value={row.name} maxLength={40} placeholder="Name" onChange={(e) => setAdds((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm" />
              <input aria-label="Add-on price" value={row.price} inputMode="decimal" placeholder="₹ extra" onChange={(e) => setAdds((r) => r.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className="w-24 rounded-lg border border-input bg-card px-3 py-2 text-right text-sm" />
              <Button type="button" size="icon" variant="ghost" aria-label="Remove row" onClick={() => setAdds((r) => r.filter((_, j) => j !== i))}><X /></Button>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => addRow()}><Plus />New add-on</Button>
      </fieldset>

      {selectedAddonNames.length ? (
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Remove add-ons</legend>
          <div className="flex flex-wrap gap-1.5">
            {selectedAddonNames.map((name) => {
              const on = removes.includes(name);
              return (
                <Button key={name} type="button" size="sm" variant={on ? "destructive" : "outline"} aria-pressed={on}
                  onClick={() => setRemoves((r) => (on ? r.filter((x) => x !== name) : [...r, name]))}>{on ? <X /> : null}{name}</Button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : `Apply to ${items.length}`}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
