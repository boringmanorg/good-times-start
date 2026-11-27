import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { saveSettings } from "@/lib/db";
import { saveRatePlans } from "@/lib/pms/actions";
import { MEAL_NAMES, planRateOn } from "@/lib/pms/plans";
import { localDate } from "@/lib/pms/dates";
import type { MealPlan, RatePlan, StayExtra, UnitType } from "@/lib/pms/types";
import { newUid } from "@/lib/sync-core";
import { useRestaurantSettings } from "@/lib/use-settings";

const field = "mt-1 h-9 w-full rounded-lg border border-input bg-card px-2 text-sm";

/** Rate plans per room type: room only, with breakfast, non-refundable… priced off the room's rate. */
export function RatePlans({ types }: { types: UnitType[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-2xl">Rate plans</h2>
      <p className="text-sm text-muted-foreground">
        Each plan's price is the room's rate for the night plus or minus your change. Booking sites
        receive each plan with its own price; the desk picks one when booking.
      </p>
      <div className="mt-3 space-y-4">
        {types.map((t) => (
          <TypePlans key={`${t.id}-${JSON.stringify(t.plans ?? [])}`} type={t} />
        ))}
      </div>
    </section>
  );
}

function TypePlans({ type }: { type: UnitType }) {
  const [plans, setPlans] = useState<RatePlan[]>(type.plans ?? []);
  const [busy, setBusy] = useState(false);
  const edit = (i: number, change: Partial<RatePlan>) =>
    setPlans(plans.map((p, j) => (j === i ? { ...p, ...change } : p)));
  const save = async () => {
    setBusy(true);
    try {
      await saveRatePlans(type.id, plans);
      toast.success(`${type.name}: plans saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const today = localDate();
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="font-semibold">
        {type.name}{" "}
        <span className="font-normal text-muted-foreground">· base {formatINR(type.rate, 0)}</span>
      </p>
      {!plans.length ? (
        <p className="text-xs text-muted-foreground">
          Sold as "Room only" at the room's rate. Add plans to sell breakfast or a non-refundable
          price.
        </p>
      ) : null}
      {plans.map((p, i) => (
        <div key={p.id} className="mt-2 grid items-end gap-2 sm:grid-cols-6">
          <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">
            Name
            <input
              className={field}
              value={p.name}
              onChange={(e) => edit(i, { name: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Meals
            <select
              className={field}
              value={p.meal}
              onChange={(e) => edit(i, { meal: e.target.value as MealPlan })}
            >
              {Object.entries(MEAL_NAMES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            ± ₹ a night
            <input
              type="number"
              className={field}
              value={p.adjust ?? ""}
              onChange={(e) =>
                edit(i, { adjust: e.target.value === "" ? 0 : Number(e.target.value) })
              }
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            ± %
            <input
              type="number"
              className={field}
              value={p.adjustPct ?? ""}
              onChange={(e) =>
                edit(i, { adjustPct: e.target.value === "" ? 0 : Number(e.target.value) })
              }
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={p.refundable}
                onChange={(e) => edit(i, { refundable: e.target.checked })}
              />
              Refundable
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={p.active}
                onChange={(e) => edit(i, { active: e.target.checked })}
              />
              On sale
            </label>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-6">
            Tonight {formatINR(planRateOn(type, p, today), 0)}
            {p.channelRef ? ` · channel code ${p.channelRef}` : ""}
          </p>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setPlans([
              ...plans,
              {
                id: newUid(),
                name: plans.length ? "Non-refundable" : "With breakfast",
                meal: plans.length ? "room_only" : "breakfast",
                refundable: !plans.length,
                adjust: plans.length ? 0 : 300,
                ...(plans.length ? { adjustPct: -10 } : {}),
                active: true,
              },
            ])
          }
        >
          Add a plan
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          Save plans
        </Button>
      </div>
    </div>
  );
}

/** Extras the desk sells on the folio: bike, breakfast, laundry, airport pick-up… */
export function ExtrasEditor() {
  const settings = useRestaurantSettings();
  const [rows, setRows] = useState<StayExtra[] | null>(null);
  const list = rows ?? settings.pmsExtras ?? [];
  const edit = (i: number, change: Partial<StayExtra>) =>
    setRows(list.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const save = async () => {
    const clean = list.map((x) => ({
      ...x,
      label: x.label.trim().replace(/\s+/g, " ").slice(0, 60),
    }));
    const bad = clean.find(
      (x) =>
        x.label.length < 2 ||
        !(x.price >= 0) ||
        x.price > 100000 ||
        ![0, 5, 12, 18, 28].includes(x.gstPct),
    );
    if (bad) {
      toast.error(`Check "${bad.label || "an extra"}": name, price and GST rate.`);
      return;
    }
    try {
      await saveSettings({ ...settings, pmsExtras: clean });
      setRows(null);
      toast.success("Extras saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-2xl">Extras</h2>
      <p className="text-sm text-muted-foreground">
        Sold on the folio with their own GST. Prices are before GST.
      </p>
      {list.map((x, i) => (
        <div key={x.id} className="mt-2 grid items-end gap-2 sm:grid-cols-6">
          <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">
            Name
            <input
              className={field}
              value={x.label}
              onChange={(e) => edit(i, { label: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            ₹
            <input
              type="number"
              min={0}
              className={field}
              value={x.price}
              onChange={(e) => edit(i, { price: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Per
            <select
              className={field}
              value={x.per}
              onChange={(e) => edit(i, { per: e.target.value as StayExtra["per"] })}
            >
              <option value="item">Each</option>
              <option value="night">Night</option>
              <option value="guest_night">Guest a night</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            GST
            <select
              className={field}
              value={x.gstPct}
              onChange={(e) => edit(i, { gstPct: Number(e.target.value) })}
            >
              {[0, 5, 12, 18, 28].map((g) => (
                <option key={g} value={g}>
                  {g}%
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 pb-2 text-xs">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={x.active}
              onChange={(e) => edit(i, { active: e.target.checked })}
            />
            On sale
          </label>
        </div>
      ))}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setRows([
              ...list,
              { id: newUid(), label: "", price: 0, gstPct: 18, per: "item", active: true },
            ])
          }
        >
          Add an extra
        </Button>
        <Button size="sm" disabled={!rows} onClick={() => void save()}>
          Save extras
        </Button>
      </div>
    </section>
  );
}
