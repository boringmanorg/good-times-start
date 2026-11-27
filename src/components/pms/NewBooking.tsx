import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatINR } from "@/lib/billing";
import { createStay } from "@/lib/pms/actions";
import { addDays, localDate, nightsOf } from "@/lib/pms/dates";
import { advanceFor, folioOf } from "@/lib/pms/folio";
import { freeForStay } from "@/lib/pms/inventory";
import { closedOn } from "@/lib/pms/rates";
import { plansOf, quotePlan, restrictionProblems } from "@/lib/pms/plans";
import type { PayMode, Stay, StaySource, Unit, UnitType } from "@/lib/pms/types";
import { cn } from "@/lib/utils";

const field = "mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";
const SOURCES: { v: StaySource; l: string }[] = [
  { v: "walk_in", l: "Walk-in" },
  { v: "phone", l: "Phone / WhatsApp" },
  { v: "website", l: "Website" },
  { v: "ota", l: "Booking site" },
];
const MODES: { v: PayMode; l: string }[] = [
  { v: "upi", l: "UPI" },
  { v: "cash", l: "Cash" },
  { v: "card", l: "Card" },
  { v: "bank", l: "Bank transfer" },
  { v: "ota_collect", l: "Paid on booking site" },
];

/** A new booking: dates, guest, how many of each room/bed type, and the advance taken. */
export function NewBooking({
  open,
  onOpenChange,
  prefill,
  types,
  units,
  stays,
  by,
  onMade,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefill?: { checkIn: string; unitId: string } | null;
  types: UnitType[];
  units: Unit[];
  stays: Stay[];
  by: string;
  onMade: (s: Stay) => void;
}) {
  const today = localDate();
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addDays(today, 1));
  const [source, setSource] = useState<StaySource>("walk_in");
  const [ota, setOta] = useState({ name: "", bookingId: "" });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [women, setWomen] = useState(0);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [rates, setRates] = useState<Record<string, number>>({});
  const [advance, setAdvance] = useState<number | "">("");
  const [mode, setMode] = useState<PayMode>("upi");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [unitFor, setUnitFor] = useState<{ typeId: string; unitId: string } | null>(null);
  // A tap on an empty night of the tape chart opens this with that bed and date chosen.
  useEffect(() => {
    if (!open || !prefill) return;
    const u = units.find((x) => x.id === prefill.unitId);
    setCheckIn(prefill.checkIn);
    setCheckOut(addDays(prefill.checkIn, 1));
    if (u) {
      setQty({ [u.typeId]: 1 });
      setUnitFor({ typeId: u.typeId, unitId: u.id });
    }
  }, [open, prefill, units]);
  const nights = nightsOf(checkIn, checkOut).length;

  const planOf = (t: UnitType) => plansOf(t).find((p) => p.id === plan[t.id]) ?? plansOf(t)[0];
  const lines = types
    .filter((t) => (qty[t.id] ?? 0) > 0)
    .map((t) => {
      const p = planOf(t);
      return {
        typeId: t.id,
        units: qty[t.id] ?? 0,
        guests: (qty[t.id] ?? 0) * (t.soldAs === "bed" ? 1 : Math.min(2, t.maxGuests)),
        rate: rates[t.id] ?? quotePlan(t, p, checkIn, checkOut),
        ...(p && p.id !== "standard" ? { planId: p.id, planName: p.name } : {}),
      };
    });
  const warnings = types
    .filter((t) => (qty[t.id] ?? 0) > 0)
    .flatMap((t) => restrictionProblems(t, checkIn, checkOut));
  const folio = useMemo(
    () =>
      folioOf(
        {
          checkIn,
          checkOut,
          lines: lines.map((l) => ({ ...l, unitIds: [] })),
          charges: [],
          payments: [],
        },
        types,
      ),
    [checkIn, checkOut, lines, types],
  );

  const save = async () => {
    setBusy(true);
    try {
      const made = await createStay(
        {
          source,
          ...(source === "ota" && ota.name ? { ota } : {}),
          checkIn,
          checkOut,
          guest: { name, phone },
          femaleGuests: women,
          lines,
          ...(advance ? { advance: { amount: Number(advance), mode } } : {}),
          assignNow: checkIn === today && !unitFor,
          ...(unitFor && (qty[unitFor.typeId] ?? 0) > 0
            ? { unitIds: { [unitFor.typeId]: [unitFor.unitId] } }
            : {}),
        },
        by,
      );
      toast.success(`Booked · ${made.reference}`);
      onMade(made);
      onOpenChange(false);
      setName("");
      setPhone("");
      setQty({});
      setAdvance("");
      setWomen(0);
      setPlan({});
      setUnitFor(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogTitle>New booking</DialogTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted-foreground">
            Check-in
            <input
              type="date"
              className={field}
              value={checkIn}
              min={today}
              onChange={(e) => {
                setCheckIn(e.target.value);
                if (e.target.value >= checkOut) setCheckOut(addDays(e.target.value, 1));
              }}
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Check-out
            <input
              type="date"
              className={field}
              value={checkOut}
              min={addDays(checkIn, 1)}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Guest name
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Mobile
            <input
              className={field}
              value={phone}
              inputMode="tel"
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Booked through
            <select
              className={field}
              value={source}
              onChange={(e) => setSource(e.target.value as StaySource)}
            >
              {SOURCES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            Women in the group
            <input
              type="number"
              min={0}
              className={field}
              value={women}
              onChange={(e) => setWomen(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          {source === "ota" ? (
            <>
              <label className="text-xs font-semibold text-muted-foreground">
                Booking site
                <input
                  className={field}
                  placeholder="MakeMyTrip, Booking.com…"
                  value={ota.name}
                  onChange={(e) => setOta({ ...ota, name: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Their booking id
                <input
                  className={field}
                  value={ota.bookingId}
                  onChange={(e) => setOta({ ...ota, bookingId: e.target.value })}
                />
              </label>
            </>
          ) : null}
        </div>

        <p className="mt-2 text-sm font-semibold">
          Rooms and beds · {nights} night{nights === 1 ? "" : "s"}
        </p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {types.map((t) => {
            const free = nights > 0 ? freeForStay(t, units, stays, checkIn, checkOut) : 0;
            const q = qty[t.id] ?? 0;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {t.name}
                    {t.femaleOnly ? (
                      <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                        Women only
                      </span>
                    ) : null}
                  </p>
                  <p className={cn("text-xs", free ? "text-muted-foreground" : "text-destructive")}>
                    {free} {t.soldAs === "bed" ? "beds" : "rooms"} free
                    {nightsOf(checkIn, checkOut).some((n) => closedOn(t, n))
                      ? " · closed to online sale on some nights"
                      : ""}
                  </p>
                </div>
                {plansOf(t).length > 1 ? (
                  <label className="text-[11px] text-muted-foreground">
                    Plan
                    <select
                      className="mt-0.5 block h-9 max-w-40 rounded-lg border border-input bg-card px-2 text-sm"
                      value={planOf(t)?.id}
                      onChange={(e) => {
                        setPlan({ ...plan, [t.id]: e.target.value });
                        const { [t.id]: _r, ...rest } = rates;
                        void _r;
                        setRates(rest);
                      }}
                    >
                      {plansOf(t).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.refundable ? "" : " · non-refundable"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="text-[11px] text-muted-foreground">
                  ₹ / night
                  <input
                    type="number"
                    min={0}
                    className="mt-0.5 h-9 w-24 rounded-lg border border-input bg-card px-2 text-sm"
                    value={rates[t.id] ?? quotePlan(t, planOf(t), checkIn, checkOut)}
                    onChange={(e) => setRates({ ...rates, [t.id]: Number(e.target.value) || 0 })}
                  />
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={`One fewer ${t.name}`}
                    disabled={!q}
                    onClick={() => setQty({ ...qty, [t.id]: q - 1 })}
                  >
                    −
                  </Button>
                  <span className="w-6 text-center tabular-nums">{q}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={`One more ${t.name}`}
                    disabled={q >= free}
                    onClick={() => setQty({ ...qty, [t.id]: q + 1 })}
                  >
                    +
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {unitFor && (qty[unitFor.typeId] ?? 0) > 0 ? (
          <p className="text-xs text-muted-foreground">
            Gives {units.find((u) => u.id === unitFor.unitId)?.label} to this booking.
          </p>
        ) : null}
        {warnings.length ? (
          <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-xs text-warning">
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <p className="mt-1 text-muted-foreground">
              Booking sites and the website would refuse these dates; the desk can still book.
            </p>
          </div>
        ) : null}
        {lines.length ? (
          <div className="rounded-xl bg-secondary p-3 text-sm">
            {folio.lines.map((l) => (
              <p key={l.label} className="flex justify-between gap-3">
                <span>
                  {l.label}
                  {l.gstPct ? ` · GST ${l.gstPct}%` : " · no GST"}
                </span>
                <span className="tabular-nums">{formatINR(l.taxable + l.gst, 0)}</span>
              </p>
            ))}
            <p className="mt-1 flex justify-between border-t border-border pt-1 font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatINR(folio.total, 0)}</span>
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Advance received (25% is {formatINR(advanceFor(folio.total), 0)})
                <input
                  type="number"
                  min={0}
                  className={field}
                  value={advance}
                  onChange={(e) => setAdvance(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Paid by
                <select
                  className={field}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PayMode)}
                >
                  {MODES.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={busy || !lines.length} onClick={() => void save()}>
            {checkIn === today ? "Book and give beds" : "Book"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
