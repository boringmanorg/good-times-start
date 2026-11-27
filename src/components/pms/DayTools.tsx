import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/billing";
import { getDb } from "@/lib/db";
import {
  markCleaned,
  runNightAudit,
  setHousekeeping,
  setHousekeepingTask,
} from "@/lib/pms/actions";
import { addDays, shortDay } from "@/lib/pms/dates";
import { auditChecks, housekeepingBoard, type BoardState } from "@/lib/pms/day";
import type { IsoDate, Stay, Unit, UnitType } from "@/lib/pms/types";
import { cn } from "@/lib/utils";

const STATE: Record<BoardState, { l: string; c: string }> = {
  arriving: { l: "Guest arriving", c: "bg-primary/15 text-primary" },
  departing: { l: "Leaving today", c: "bg-gold/20 text-warning" },
  occupied: { l: "Guest in", c: "bg-success/15 text-success" },
  vacant: { l: "Empty", c: "bg-secondary text-muted-foreground" },
};
const HK: Record<Unit["housekeeping"], { l: string; c: string }> = {
  clean: { l: "Clean", c: "text-success" },
  dirty: { l: "Dirty", c: "text-warning" },
  inspect: { l: "Inspect", c: "text-foreground" },
  out_of_order: { l: "Out of order", c: "text-destructive" },
};

/**
 * Housekeeping board: every bed and room in cleaning order (dirty rooms with a guest arriving
 * first), who is on it, one tap to mark it clean. Works offline; syncs like every desk change.
 */
export function HousekeepingBoard({
  units,
  stays,
  today,
  by,
}: {
  units: Unit[];
  stays: Stay[];
  today: IsoDate;
  by: string;
}) {
  const board = useMemo(() => housekeepingBoard(units, stays, today), [units, stays, today]);
  const [who, setWho] = useState("");
  const toClean = board.filter(
    (r) => r.unit.housekeeping === "dirty" || r.unit.housekeeping === "inspect",
  );
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <p className="text-sm text-muted-foreground">
          {toClean.length
            ? `${toClean.length} to clean · rooms with a guest arriving come first.`
            : "Everything is clean."}
        </p>
        <label className="ml-auto text-xs font-semibold text-muted-foreground">
          Housekeeper
          <input
            className="mt-1 block h-9 w-44 rounded-lg border border-input bg-card px-2 text-sm"
            placeholder="Name to assign"
            value={who}
            onChange={(e) => setWho(e.target.value)}
          />
        </label>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {board.map(({ unit, state, guest }) => (
          <li key={unit.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="w-16 font-bold">{unit.label}</span>
            <span
              className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATE[state].c)}
            >
              {STATE[state].l}
            </span>
            <span className={cn("text-xs font-semibold", HK[unit.housekeeping].c)}>
              {HK[unit.housekeeping].l}
              {unit.note ? ` · ${unit.note}` : ""}
            </span>
            {guest ? <span className="truncate text-xs text-muted-foreground">{guest}</span> : null}
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              {unit.task ? (
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs">
                  {unit.task.assignee} since{" "}
                  {new Date(unit.task.at).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
              {unit.housekeeping !== "clean" &&
              unit.housekeeping !== "out_of_order" &&
              !unit.task &&
              who.trim() ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void run(() => setHousekeepingTask(unit.id, who, by))}
                >
                  Assign {who.trim().split(" ")[0]}
                </Button>
              ) : null}
              {unit.housekeeping === "dirty" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void run(() => setHousekeeping(unit.id, "inspect"))}
                >
                  Ready to inspect
                </Button>
              ) : null}
              {unit.housekeeping === "dirty" || unit.housekeeping === "inspect" ? (
                <Button size="sm" onClick={() => void run(() => markCleaned(unit.id))}>
                  Clean
                </Button>
              ) : null}
              {unit.housekeeping === "clean" && state !== "occupied" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void run(() => setHousekeeping(unit.id, "dirty"))}
                >
                  Mark dirty
                </Button>
              ) : null}
              {unit.housekeeping === "out_of_order" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void run(() => markCleaned(unit.id))}
                >
                  Back in service
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const why = window.prompt(`Why is ${unit.label} out of order?`);
                    if (why?.trim()) void run(() => setHousekeeping(unit.id, "out_of_order", why));
                  }}
                >
                  Out of order
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Night audit: close a day. Lists no-shows to mark, overstays, money owed, tomorrow's arrivals
 * without beds and missing Form-III, then keeps the day's figures. A day closes once.
 */
export function NightAuditPanel({
  types,
  units,
  stays,
  today,
  by,
}: {
  types: UnitType[];
  units: Unit[];
  stays: Stay[];
  today: IsoDate;
  by: string;
}) {
  const audits = useLiveQuery(
    () => getDb().nightAudits.orderBy("date").reverse().limit(14).toArray(),
    [],
    [],
  );
  const lastClosed = audits[0]?.date;
  const [day, setDay] = useState<IsoDate>(() => today);
  const checks = useMemo(() => auditChecks(stays, types, day), [stays, types, day]);
  const [noShow, setNoShow] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = audits.some((a) => a.date === day);
  const unitLabel = (s: Stay) =>
    s.lines
      .flatMap((l) => l.unitIds)
      .map((id) => units.find((u) => u.id === id)?.label ?? "?")
      .join(", ") || "no bed yet";
  const close = async () => {
    setBusy(true);
    try {
      const ids = checks.noShows.filter((s) => noShow[s.id] !== false).map((s) => s.id);
      await runNightAudit(day, ids, notes, by);
      toast.success(`${shortDay(day)} closed`);
      setNotes("");
      setNoShow({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-muted-foreground">
          Day to close
          <input
            type="date"
            className="mt-1 block h-10 rounded-lg border border-input bg-card px-2 text-sm"
            max={today}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {lastClosed ? `Last closed: ${shortDay(lastClosed)}` : "No day closed yet."}
          {lastClosed && lastClosed < addDays(today, -1) ? " · a day is waiting to be closed." : ""}
        </p>
      </div>
      {closed ? (
        <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
          {shortDay(day)} is closed.
        </p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Box title="No-shows to mark" n={checks.noShows.length}>
              {checks.noShows.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={noShow[s.id] !== false}
                    onChange={(e) => setNoShow({ ...noShow, [s.id]: e.target.checked })}
                  />
                  {s.guest.name} · due {shortDay(s.checkIn)} ·{" "}
                  {s.ota?.name ?? s.source.replace("_", "-")}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">Untick anyone still expected tonight.</p>
            </Box>
            <Box title="Past check-out, still in house" n={checks.overstays.length}>
              {checks.overstays.map((s) => (
                <p key={s.id}>
                  {s.guest.name} · {unitLabel(s)} · was due {shortDay(s.checkOut)}
                </p>
              ))}
            </Box>
            <Box title="In house with money owing" n={checks.unpaid.length}>
              {checks.unpaid.map(({ stay, due }) => (
                <p key={stay.id} className="flex justify-between gap-2">
                  <span>
                    {stay.guest.name} · {unitLabel(stay)}
                  </span>
                  <span className="font-semibold text-warning tabular-nums">
                    {formatINR(due, 0)}
                  </span>
                </p>
              ))}
            </Box>
            <Box title="Tomorrow's arrivals without beds" n={checks.unassignedTomorrow.length}>
              {checks.unassignedTomorrow.map((s) => (
                <p key={s.id}>
                  {s.guest.name} ·{" "}
                  {s.lines
                    .map(
                      (l) => `${l.units} × ${types.find((t) => t.id === l.typeId)?.name ?? "room"}`,
                    )
                    .join(", ")}
                </p>
              ))}
            </Box>
            <Box title="Form-III not recorded" n={checks.formIII.length}>
              {checks.formIII.map((s) => (
                <p key={s.id}>{s.guest.name}</p>
              ))}
            </Box>
          </div>
          <label className="block text-xs font-semibold text-muted-foreground">
            Note for the day (optional)
            <input
              className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <Button disabled={busy} onClick={() => void close()}>
            {busy ? "Closing…" : `Close ${shortDay(day)}`}
          </Button>
        </>
      )}
      {audits.length ? (
        <section className="rounded-xl border border-border">
          <p className="border-b border-border px-3 py-2 text-sm font-semibold">Closed days</p>
          <ul className="divide-y divide-border text-sm">
            {audits.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2">
                <span className="w-28 font-semibold">{shortDay(a.date)}</span>
                <span>{a.occupancyPct}% sold</span>
                <span>{a.inHouse} in house</span>
                <span>Room revenue {formatINR(a.roomRevenue, 0)}</span>
                <span>
                  Taken{" "}
                  {formatINR(
                    Object.values(a.collected).reduce((s, v) => s + v, 0),
                    0,
                  )}
                </span>
                {a.noShows.length ? (
                  <span className="text-warning">
                    {a.noShows.length} no-show{a.noShows.length === 1 ? "" : "s"}
                  </span>
                ) : null}
                <span className="text-muted-foreground">by {a.by}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Box({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <section
      className={cn("rounded-xl border p-3", n ? "border-gold/50 bg-gold/5" : "border-border")}
    >
      <p className="text-sm font-semibold">
        {title} · {n}
      </p>
      {n ? (
        <div className="mt-1 space-y-1 text-sm">{children}</div>
      ) : (
        <p className="text-xs text-muted-foreground">None.</p>
      )}
    </section>
  );
}
