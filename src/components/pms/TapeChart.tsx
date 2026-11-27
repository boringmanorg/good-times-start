import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moveStayTo } from "@/lib/pms/actions";
import { addDays, shortDay } from "@/lib/pms/dates";
import { tapeBars, tapeRows, unassignedIn, windowNights, type TapeBar } from "@/lib/pms/tape";
import type { IsoDate, Stay, Unit, UnitType } from "@/lib/pms/types";
import { cn } from "@/lib/utils";

const CELL = 64; // px per night
const LABEL = 112; // px for the bed/room column
const HK: Record<Unit["housekeeping"], string> = {
  clean: "bg-success",
  dirty: "bg-gold",
  inspect: "bg-white ring-1 ring-border",
  out_of_order: "bg-destructive",
};
const TONE: Partial<Record<Stay["status"], string>> = {
  booked: "bg-primary text-primary-foreground",
  checked_in: "bg-success text-white",
  checked_out: "bg-secondary text-muted-foreground",
};

type Drag = {
  bar: TapeBar;
  mode: "move" | "stretch";
  startX: number;
  startY: number;
  grabNight: number;
  dx: number;
  dy: number;
};

/**
 * The tape chart: beds and rooms down the side, nights across, every stay a bar. Drag a bar to
 * another bed/room or other dates, drag its right edge to change check-out, tap it to open the
 * stay, tap an empty night to book that bed. The stay dialog has the same moves for keyboards
 * and phones.
 */
export function TapeChart({
  types,
  units,
  stays,
  today,
  by,
  onOpen,
  onBook,
}: {
  types: UnitType[];
  units: Unit[];
  stays: Stay[];
  today: IsoDate;
  by: string;
  onOpen: (s: Stay) => void;
  onBook: (unitId: string, night: IsoDate) => void;
}) {
  const [from, setFrom] = useState(() => addDays(today, -1));
  const [days, setDays] = useState(14);
  const [drag, setDrag] = useState<Drag | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => tapeRows(types, units), [types, units]);
  const nights = windowNights(from, days);
  const bars = useMemo(() => tapeBars(stays, from, days), [stays, from, days]);
  const waiting = useMemo(() => unassignedIn(stays, from, days), [stays, from, days]);
  const byStay = new Map(stays.map((s) => [s.id, s]));

  const cellAt = (x: number, y: number): { unitId: string; night: IsoDate } | null => {
    // The dragged bar sits on top of the cells: look through it.
    const el = document
      .elementsFromPoint(x, y)
      .map((e) => (e as HTMLElement).closest<HTMLElement>("[data-cell]"))
      .find(Boolean);
    if (!el?.dataset["unit"] || !el.dataset["night"]) return null;
    return { unitId: el.dataset["unit"], night: el.dataset["night"] };
  };

  const finish = async (d: Drag, x: number, y: number) => {
    const target = cellAt(x, y);
    const stay = byStay.get(d.bar.stayId);
    if (!stay || !target) return;
    const grabbed = addDays(from, d.grabNight);
    try {
      if (d.mode === "stretch") {
        const checkOut = addDays(target.night, 1);
        if (checkOut === stay.checkOut) return;
        await moveStayTo(
          stay.id,
          { fromUnitId: d.bar.unitId, toUnitId: d.bar.unitId, checkOut },
          by,
        );
        toast.success(`Check-out now ${shortDay(checkOut)}`);
      } else {
        const shift = Math.round(
          (Date.parse(`${target.night}T00:00:00Z`) - Date.parse(`${grabbed}T00:00:00Z`)) /
            86_400_000,
        );
        if (!shift && target.unitId === d.bar.unitId) {
          onOpen(stay);
          return;
        }
        await moveStayTo(
          stay.id,
          { fromUnitId: d.bar.unitId, toUnitId: target.unitId, ...(shift ? { shift } : {}) },
          by,
        );
        toast.success(`${stay.guest.name} moved`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setFrom(addDays(from, -7))}>
          Earlier
        </Button>
        <Button size="sm" variant="outline" onClick={() => setFrom(addDays(today, -1))}>
          Today
        </Button>
        <Button size="sm" variant="outline" onClick={() => setFrom(addDays(from, 7))}>
          Later
        </Button>
        <div className="ml-auto flex gap-1" role="radiogroup" aria-label="Nights shown">
          {[7, 14, 30].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={days === n ? "default" : "outline"}
              role="radio"
              aria-checked={days === n}
              onClick={() => setDays(n)}
            >
              {n} nights
            </Button>
          ))}
        </div>
      </div>

      {waiting.length ? (
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
          <p className="font-semibold text-warning">Waiting for beds or rooms</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {waiting.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpen(s)}
                className="rounded-lg bg-card px-2 py-1 text-xs font-semibold"
              >
                {s.guest.name} · {shortDay(s.checkIn)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card" ref={grid}>
        <div
          style={{ width: LABEL + nights.length * CELL }}
          className="relative select-none text-xs"
        >
          <div className="sticky top-0 z-20 flex border-b border-border bg-secondary">
            <div
              style={{ width: LABEL }}
              className="sticky left-0 z-20 shrink-0 bg-secondary px-2 py-2 font-semibold"
            >
              Bed / room
            </div>
            {nights.map((n) => {
              const wd = new Date(`${n}T00:00:00Z`).getUTCDay();
              return (
                <div
                  key={n}
                  style={{ width: CELL }}
                  className={cn(
                    "shrink-0 px-1 py-2 text-center font-semibold",
                    n === today && "bg-primary/15 text-primary",
                    (wd === 0 || wd === 6) && n !== today && "bg-raised",
                  )}
                >
                  {shortDay(n).replace(/ [A-Z][a-z]{2}$/, "")}
                </div>
              );
            })}
          </div>
          {types.map((t) => {
            const typeRows = rows.filter((r) => r.type.id === t.id);
            if (!typeRows.length) return null;
            return (
              <div key={t.id}>
                <div className="sticky left-0 bg-card px-2 pb-1 pt-3 text-[11px] font-bold text-muted-foreground">
                  {t.name}
                </div>
                {typeRows.map(({ unit }) => (
                  <div key={unit.id} className="relative flex h-9 border-t border-border">
                    <div
                      style={{ width: LABEL }}
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 bg-card px-2 font-semibold"
                    >
                      <span
                        className={cn(
                          "inline-block size-2 shrink-0 rounded-full",
                          HK[unit.housekeeping],
                        )}
                        aria-label={unit.housekeeping.replace("_", " ")}
                      />
                      {unit.label}
                    </div>
                    {nights.map((n) => (
                      <button
                        key={n}
                        type="button"
                        data-cell
                        data-unit={unit.id}
                        data-night={n}
                        aria-label={`Book ${unit.label} on ${shortDay(n)}`}
                        onClick={() => {
                          if (n >= today && unit.housekeeping !== "out_of_order")
                            onBook(unit.id, n);
                        }}
                        style={{ width: CELL }}
                        className={cn(
                          "h-full shrink-0 border-l border-border/60",
                          unit.housekeeping === "out_of_order"
                            ? "bg-destructive/10"
                            : n < today
                              ? "bg-secondary/40"
                              : "hover:bg-primary/5",
                        )}
                      />
                    ))}
                    {bars
                      .filter((b) => b.unitId === unit.id)
                      .map((b) => {
                        const s = byStay.get(b.stayId);
                        const dragging = drag?.bar === b;
                        return (
                          <div
                            key={`${b.stayId}-${b.unitId}`}
                            role="button"
                            tabIndex={0}
                            title={`${b.label} · ${s?.reference ?? ""}`}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === " ") && s) {
                                e.preventDefault();
                                onOpen(s);
                              }
                            }}
                            onPointerDown={(e) => {
                              if (!s || e.button !== 0) return;
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const stretch = rect.right - e.clientX < 12 && !b.after;
                              const grabNight =
                                b.start + Math.floor((e.clientX - rect.left) / CELL);
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                              setDrag({
                                bar: b,
                                mode: stretch ? "stretch" : "move",
                                startX: e.clientX,
                                startY: e.clientY,
                                grabNight,
                                dx: 0,
                                dy: 0,
                              });
                            }}
                            onPointerMove={(e) => {
                              if (dragging && drag)
                                setDrag({
                                  ...drag,
                                  dx: e.clientX - drag.startX,
                                  dy: drag.mode === "move" ? e.clientY - drag.startY : 0,
                                });
                            }}
                            onPointerUp={(e) => {
                              if (!dragging || !drag) return;
                              const d = drag;
                              setDrag(null);
                              if (Math.abs(d.dx) < 6 && Math.abs(d.dy) < 6) {
                                if (s) onOpen(s);
                                return;
                              }
                              void finish(d, e.clientX, e.clientY);
                            }}
                            onPointerCancel={() => setDrag(null)}
                            style={{
                              left: LABEL + b.start * CELL + 2,
                              top: 4,
                              height: 28,
                              width: Math.max(
                                CELL - 4,
                                b.span * CELL -
                                  4 +
                                  (dragging && drag.mode === "stretch" ? drag.dx : 0),
                              ),
                              transform:
                                dragging && drag.mode === "move"
                                  ? `translate(${drag.dx}px, ${drag.dy}px)`
                                  : undefined,
                            }}
                            className={cn(
                              "absolute z-10 flex cursor-grab touch-none items-center overflow-hidden rounded-md px-2 text-[11px] font-semibold shadow-sm",
                              TONE[b.status] ?? "bg-secondary",
                              b.before && "rounded-l-none",
                              b.after && "rounded-r-none",
                              dragging && "z-30 cursor-grabbing opacity-90 ring-2 ring-ring",
                            )}
                          >
                            <span className="truncate">{b.label}</span>
                            {!b.after ? (
                              <span
                                aria-hidden="true"
                                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/10"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag a stay to another bed or other dates · drag its right edge to change check-out · tap an
        empty night to book.
        <span className="ml-3">
          <span className="mr-1 inline-block size-2 rounded-full bg-primary" />
          Booked
        </span>
        <span className="ml-3">
          <span className="mr-1 inline-block size-2 rounded-full bg-success" />
          In house
        </span>
        <span className="ml-3">
          <span className="mr-1 inline-block size-2 rounded-full bg-gold" />
          Dirty
        </span>
      </p>
    </div>
  );
}
