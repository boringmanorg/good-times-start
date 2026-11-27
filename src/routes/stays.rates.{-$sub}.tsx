import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SmartRates } from "@/components/pms/SmartRates";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { saveRates, saveRestrictions } from "@/lib/pms/actions";
import { addDays, localDate, shortDay } from "@/lib/pms/dates";
import { rateGrid } from "@/lib/pms/rates";
import { usePms } from "@/lib/pms/use-pms";
import { featureOn } from "@/lib/plans";
import { useEntitlements } from "@/lib/use-entitlements";
import { isAdmin, useStaff } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { SILENT_PARAMS } from "@/lib/silent-route";

/**
 * Rates & availability, the heart of a YCS-style extranet: per room type and night, how many are
 * left to sell, the rate, and whether it's open. Owners and managers change rates and close
 * nights (one night by tapping it, or a range with weekdays); the desk can look.
 */
export const Route = createFileRoute("/stays/rates/{-$sub}")({
  params: SILENT_PARAMS,
  head: () => ({
    meta: [{ title: "Rates & availability — XTSY" }, { name: "robots", content: "noindex" }],
  }),
  component: RatesPage,
});

const DAYS = 14;
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const field = "mt-1 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

function RatesPage() {
  const { user } = useStaff();
  const plan = useEntitlements();
  const admin = isAdmin(user);
  const { types, units, stays } = usePms();
  const today = localDate();
  const [from, setFrom] = useState(today);
  const grid = useMemo(
    () => rateGrid(types, units, stays, from, DAYS),
    [types, units, stays, from],
  );
  const [bulk, setBulk] = useState({
    typeId: "",
    from: today,
    to: addDays(today, 30),
    rate: "" as number | "",
    open: "keep" as "keep" | "open" | "close",
    weekdays: [] as number[],
    minStay: "" as number | "",
    cta: "keep" as "keep" | "on" | "off",
    ctd: "keep" as "keep" | "on" | "off",
  });
  const restrictionsChanged = bulk.minStay !== "" || bulk.cta !== "keep" || bulk.ctd !== "keep";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  const editRate = (typeId: string, night: string, current: number) => {
    if (!admin) return;
    const v = window.prompt(`Rate for ${shortDay(night)} (₹ before GST)`, String(current));
    if (v === null || v.trim() === "") return;
    void run(() => saveRates(typeId, night, night, { rate: Number(v) }), "Rate saved");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="xt-eyebrow text-primary">Rates & availability</p>
            <h1 className="text-4xl">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              Rates are per bed or room per night, before GST. Closed nights aren't offered online;
              the desk can still book them.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFrom(addDays(from, -DAYS))}
              disabled={from <= today}
            >
              Earlier
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFrom(today)}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFrom(addDays(from, DAYS))}>
              Later
            </Button>
          </div>
        </header>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 min-w-48 bg-card px-3 py-2 text-left font-semibold">
                  Room type
                </th>
                {grid[0]?.cells.map((c) => {
                  const d = new Date(`${c.night}T00:00:00Z`).getUTCDay();
                  return (
                    <th
                      key={c.night}
                      className={cn(
                        "min-w-20 px-1 py-2 text-center font-semibold",
                        d === 0 || d === 6 ? "bg-secondary" : "",
                      )}
                    >
                      {WEEK[d]}
                      <br />
                      <span className="text-muted-foreground">
                        {c.night.slice(8)}/{c.night.slice(5, 7)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grid.map(({ type, total, cells }) => [
                <tr key={`${type.id}-a`} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-card px-3 pt-3 font-semibold" rowSpan={3}>
                    {type.name}
                    <br />
                    <span className="font-normal text-muted-foreground">
                      {total}{" "}
                      {type.soldAs === "bed"
                        ? total === 1
                          ? "bed"
                          : "beds"
                        : total === 1
                          ? "room"
                          : "rooms"}{" "}
                      · base {formatINR(type.rate, 0)}
                    </span>
                  </td>
                  {cells.map((c) => (
                    <td key={c.night} className="px-1 pt-2 text-center">
                      <span
                        className={cn(
                          "inline-block min-w-12 rounded-lg px-1.5 py-1 font-bold tabular-nums",
                          c.free === 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-accent text-accent-foreground",
                        )}
                        title={c.held ? `Left to sell · ${c.held} sold on the booking engine or booking sites` : "Left to sell"}
                      >
                        {c.free}
                      </span>
                      {c.held ? (
                        <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{c.held} sold online</span>
                      ) : null}
                    </td>
                  ))}
                </tr>,
                <tr key={`${type.id}-b`}>
                  {cells.map((c) => (
                    <td key={c.night} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        disabled={!admin}
                        onClick={() => editRate(type.id, c.night, c.rate)}
                        className={cn(
                          "w-full rounded-lg border px-1 py-1 font-semibold tabular-nums",
                          c.changed && c.rate !== type.rate
                            ? "border-primary text-primary"
                            : "border-border",
                          admin ? "hover:border-primary" : "cursor-default",
                        )}
                      >
                        {formatINR(c.rate, 0)}
                      </button>
                    </td>
                  ))}
                </tr>,
                <tr key={`${type.id}-c`}>
                  {cells.map((c) => (
                    <td key={c.night} className="px-1 pb-3 text-center">
                      <button
                        type="button"
                        disabled={!admin}
                        aria-pressed={!c.closed}
                        onClick={() =>
                          void run(
                            () => saveRates(type.id, c.night, c.night, { closed: !c.closed }),
                            c.closed ? "Opened" : "Closed to online sale",
                          )
                        }
                        className={cn(
                          "w-full rounded-full px-1 py-0.5 text-[11px] font-bold",
                          c.closed
                            ? "bg-destructive text-white"
                            : "bg-secondary text-muted-foreground",
                          admin ? "" : "cursor-default",
                        )}
                      >
                        {c.closed ? "Closed" : "Open"}
                      </button>
                      {c.minStay || c.cta || c.ctd ? (
                        <span className="mt-0.5 block text-[10px] font-semibold text-warning">
                          {[
                            c.minStay ? `Min ${c.minStay}` : "",
                            c.cta ? "CTA" : "",
                            c.ctd ? "CTD" : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>,
              ])}
            </tbody>
          </table>
          {!types.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Add room types under Property first.
            </p>
          ) : null}
        </div>

        {types.length && featureOn(plan, "rate_suggestions") ? (
          <SmartRates types={types} units={units} stays={stays} today={today} canApply={admin} />
        ) : null}

        {admin && types.length ? (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-2xl">Change many nights</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <label className="text-xs font-semibold text-muted-foreground lg:col-span-2">
                Room type
                <select
                  className={field}
                  value={bulk.typeId}
                  onChange={(e) => setBulk({ ...bulk, typeId: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                From
                <input
                  type="date"
                  className={field}
                  min={today}
                  value={bulk.from}
                  onChange={(e) => setBulk({ ...bulk, from: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                To
                <input
                  type="date"
                  className={field}
                  min={bulk.from}
                  value={bulk.to}
                  onChange={(e) => setBulk({ ...bulk, to: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                New rate (blank = keep)
                <input
                  type="number"
                  min={0}
                  className={field}
                  value={bulk.rate}
                  onChange={(e) =>
                    setBulk({ ...bulk, rate: e.target.value === "" ? "" : Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Online sale
                <select
                  className={field}
                  value={bulk.open}
                  onChange={(e) =>
                    setBulk({ ...bulk, open: e.target.value as "keep" | "open" | "close" })
                  }
                >
                  <option value="keep">Keep as is</option>
                  <option value="open">Open</option>
                  <option value="close">Close</option>
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold text-muted-foreground">
                Minimum stay (nights; 1 = none, blank = keep)
                <input
                  type="number"
                  min={1}
                  max={30}
                  className={field}
                  value={bulk.minStay}
                  onChange={(e) =>
                    setBulk({
                      ...bulk,
                      minStay: e.target.value === "" ? "" : Math.trunc(Number(e.target.value)),
                    })
                  }
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Closed to arrival
                <select
                  className={field}
                  value={bulk.cta}
                  onChange={(e) =>
                    setBulk({ ...bulk, cta: e.target.value as "keep" | "on" | "off" })
                  }
                >
                  <option value="keep">Keep as is</option>
                  <option value="on">Yes</option>
                  <option value="off">No</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Closed to departure
                <select
                  className={field}
                  value={bulk.ctd}
                  onChange={(e) =>
                    setBulk({ ...bulk, ctd: e.target.value as "keep" | "on" | "off" })
                  }
                >
                  <option value="keep">Keep as is</option>
                  <option value="on">Yes</option>
                  <option value="off">No</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-muted-foreground">Only on</span>
              {WEEK.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={bulk.weekdays.includes(i)}
                  onClick={() =>
                    setBulk({
                      ...bulk,
                      weekdays: bulk.weekdays.includes(i)
                        ? bulk.weekdays.filter((x) => x !== i)
                        : [...bulk.weekdays, i],
                    })
                  }
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold",
                    bulk.weekdays.includes(i)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary",
                  )}
                >
                  {w}
                </button>
              ))}
              <span className="text-xs text-muted-foreground">
                {bulk.weekdays.length ? "" : "(every day)"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Booking sites and the website obey minimum stay and closed to arrival/departure; the
              desk sees them as warnings.
            </p>
            <Button
              className="mt-4"
              disabled={
                !bulk.typeId || (bulk.rate === "" && bulk.open === "keep" && !restrictionsChanged)
              }
              onClick={() =>
                void run(async () => {
                  if (bulk.rate !== "" || bulk.open !== "keep")
                    await saveRates(
                      bulk.typeId,
                      bulk.from,
                      bulk.to,
                      {
                        ...(bulk.rate !== "" ? { rate: bulk.rate } : {}),
                        ...(bulk.open !== "keep" ? { closed: bulk.open === "close" } : {}),
                      },
                      bulk.weekdays,
                    );
                  if (restrictionsChanged)
                    await saveRestrictions(
                      bulk.typeId,
                      bulk.from,
                      bulk.to,
                      {
                        ...(bulk.minStay !== ""
                          ? { minStay: bulk.minStay <= 1 ? null : bulk.minStay }
                          : {}),
                        ...(bulk.cta !== "keep" ? { cta: bulk.cta === "on" } : {}),
                        ...(bulk.ctd !== "keep" ? { ctd: bulk.ctd === "on" } : {}),
                      },
                      bulk.weekdays,
                    );
                }, "Calendar updated")
              }
            >
              Save changes
            </Button>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
