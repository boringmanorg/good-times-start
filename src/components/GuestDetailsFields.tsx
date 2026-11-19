import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Star } from "lucide-react";
import { getDb } from "@/lib/db";
import { rememberCustomer } from "@/lib/customer-actions";
import { guestDiscount, guestMatches } from "@/lib/customer-logic";
import type { Customer, OrderType } from "@/lib/types";
import { cn } from "@/lib/utils";

type GuestDetails = { name?: string; phone?: string; gstin?: string };

export function GuestDetailsFields({
  customer, setCustomer, guestCount, setGuestCount, orderType, tableSeats,
}: {
  customer: GuestDetails;
  setCustomer: (value: GuestDetails) => void;
  guestCount?: number | undefined;
  setGuestCount: (value: number | undefined) => void;
  orderType: OrderType;
  tableSeats?: number | undefined;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Saved guests come from this device's copy, which every terminal keeps in sync.
  const saved = useLiveQuery(() => getDb().customers.toArray(), []);
  // Visits per guest, so regulars come first among equal matches.
  const visits = useLiveQuery(async () => {
    const m = new Map<string, number>();
    for (const o of await getDb().orders.where("customerId").above("").toArray()) if (o.status === "settled" && o.customerId) m.set(o.customerId, (m.get(o.customerId) ?? 0) + 1);
    return m;
  }, [], new Map<string, number>());
  const phoneDigits = (customer.phone ?? "").replace(/\D/g, "").slice(-10);
  const known = (saved ?? []).find((c) => c.id === phoneDigits);
  const matches = useMemo(() => guestMatches(saved ?? [], customer.name ?? "", visits)
    .filter((c) => !(c.id === phoneDigits && c.name?.toLowerCase() === (customer.name ?? "").trim().toLowerCase())),
  [saved, visits, customer.name, phoneDigits]);
  const pick = (c: Customer) => { const next = { ...customer, name: c.name ?? "", phone: c.phone }; setCustomer(next); setOpen(false); save(next); };
  // Save as soon as both are filled so other terminals see this guest immediately.
  const save = (c: GuestDetails) => {
    if (c.name?.trim() && (c.phone ?? "").replace(/\D/g, "").length === 10) void rememberCustomer(c);
  };
  const maxGuests = orderType === "dine-in" ? Math.max(1, Math.min(50, tableSeats ?? 6)) : 50;
  const quickMax = Math.min(6, maxGuests);
  const custom = maxGuests > 6 && (customMode || (guestCount ?? 0) > 6);

  return (
    <div className="@container mt-2 w-full space-y-1">
      {/* Narrow bill panels (phones, tablet split view): the name gets its own row so nothing is cut off. */}
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-1.5 @[24rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem]">
        <div className="relative col-span-2 min-w-0 @[24rem]:col-span-1">
          <input aria-label="Guest name, required" aria-required="true" required placeholder="Guest name *" maxLength={60}
            role="combobox" aria-expanded={open && matches.length > 0} aria-autocomplete="list" autoComplete="off"
            value={customer.name ?? ""}
            aria-controls="saved-guests" aria-activedescendant={open && matches[active] ? `guest-${matches[active]!.id}` : undefined}
            onFocus={() => setOpen(true)}
            onBlur={() => { window.setTimeout(() => setOpen(false), 150); save(customer); }}
            onChange={(e) => { setOpen(true); setActive(0); setCustomer({ ...customer, name: e.target.value }); }}
            onKeyDown={(e) => {
              if (!open || !matches.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
              else if (e.key === "Enter") { e.preventDefault(); const c = matches[active]; if (c) pick(c); }
              else if (e.key === "Escape") setOpen(false);
            }}
            className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px]" />
          {open && matches.length > 0 ? (
            <div className="absolute left-0 top-10 z-50 w-full min-w-64 max-w-[90vw] overflow-hidden rounded-lg border-2 border-primary bg-popover text-popover-foreground shadow-2xl">
              <p className="border-b border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">Returning guest · ↑↓ then Enter, or tap</p>
              <ul id="saved-guests" role="listbox" aria-label="Saved guests" className="max-h-64 overflow-y-auto py-1">
                {matches.map((c, i) => {
                  const d = guestDiscount(c); const n = visits.get(c.id) ?? 0;
                  return (
                    <li key={c.id} id={`guest-${c.id}`} role="option" aria-selected={i === active}>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(c)}
                        className={cn("flex min-h-11 w-full items-center justify-between gap-2 px-3 py-1.5 text-left", i === active ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 truncate text-sm font-semibold">{c.priority ? <Star className="size-3.5 shrink-0 fill-current" aria-label="Priority guest" /> : null}{c.name}</span>
                          <span className={cn("block text-[11px]", i === active ? "text-primary-foreground/80" : "text-muted-foreground")}>{n ? `${n} visit${n === 1 ? "" : "s"}` : "New"}{d ? ` · ${d}% off` : ""}</span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums">{c.phone}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
        <input aria-label="Guest mobile number, required" aria-required="true" required placeholder="Mobile *" type="tel" inputMode="numeric" maxLength={10}
          value={phoneDigits}
          onChange={(e) => {
            const phone = e.target.value.replace(/\D/g, "").slice(0, 10);
            const known = phone.length === 10 && !customer.name?.trim() ? saved?.find((c) => c.id === phone) : undefined;
            setCustomer({ ...customer, phone, ...(known?.name ? { name: known.name } : {}) });
          }}
          onBlur={() => save(customer)}
          className="h-9 min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] tabular-nums" />
        <select aria-label="Total number of guests, required" aria-required="true" required
          value={custom ? "custom" : guestCount ? String(guestCount) : ""}
          onChange={(e) => {
            if (e.target.value === "custom") { setCustomMode(true); if ((guestCount ?? 0) <= 6) setGuestCount(undefined); }
            else { setCustomMode(false); setGuestCount(e.target.value ? Number(e.target.value) : undefined); }
          }}
          className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-[13px]">
          <option value="">Guests *</option>
          {Array.from({ length: quickMax }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}
          {maxGuests > 6 ? <option value="custom">Custom (7–{maxGuests})</option> : null}
        </select>
      </div>
      {custom && maxGuests > 6 ? (
        <label className="block text-[11px] text-muted-foreground">
          {orderType === "dine-in" ? `Custom guest count (table capacity: ${maxGuests})` : "Custom guest count"}
          <input aria-label="Custom total number of guests" type="number" inputMode="numeric" min={7} max={maxGuests}
            required value={(guestCount ?? 0) > 6 ? guestCount : ""}
            onChange={(e) => setGuestCount(e.target.value ? Number(e.target.value) : undefined)}
            className="mt-0.5 h-8 w-full rounded-md border border-input bg-background px-2 text-xs tabular-nums" />
        </label>
      ) : null}
      {known && (known.priority || guestDiscount(known) || known.note) ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          {known.priority ? <span className="inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 font-semibold text-primary-foreground"><Star className="size-3 fill-current" />Priority guest</span> : null}
          {guestDiscount(known) ? <span className="font-semibold text-success">{guestDiscount(known)}% guest discount</span> : null}
          {known.note ? <span className="text-muted-foreground">Note: {known.note}</span> : null}
        </p>
      ) : null}
      {orderType === "dine-in" && tableSeats ? <p className="text-[10px] text-muted-foreground">Table capacity: {tableSeats} guests</p> : null}
    </div>
  );
}
