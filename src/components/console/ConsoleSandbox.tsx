import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FlaskConical, KeyRound, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { consoleToken } from "@/lib/console-client";
import { localDate, addDays } from "@/lib/pms/dates";
import { CHANNELS, type ChannelId } from "@/lib/sandbox/core";
import {
  sandboxCancel,
  sandboxChange,
  sandboxCreateKey,
  sandboxLoadSample,
  sandboxOverview,
  sandboxRevokeKey,
  sandboxSimulate,
  sandboxTestWebhook,
} from "@/lib/sandbox.functions";
import { APP_ORIGIN } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { Failed, Loading } from "./ConsoleBits";

const field = "mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm";
const label = "text-xs font-semibold text-muted-foreground";
const API = `${APP_ORIGIN}/api/sandbox/v1`;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const say = <T,>(r: Result<T>, done: string): r is { ok: true; data: T } => {
  if (r.ok) toast.success(done);
  else toast.error(r.error);
  return r.ok;
};

/**
 * Console → stay property → Sandbox. On a TEST property only: send bookings as a booking site
 * would, change or cancel them, watch availability and every call, and hand partners a test key
 * for the sandbox API. A real property shows how to make a test one instead.
 */
export function ConsoleSandbox({ restaurantId, name }: { restaurantId: string; name: string }) {
  const qc = useQueryClient();
  const today = localDate();
  const q = useQuery({
    queryKey: ["console", "sandbox", restaurantId],
    queryFn: async () =>
      sandboxOverview({ data: { token: await consoleToken(), restaurantId, from: today } }),
    refetchInterval: 15_000,
  });
  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["console", "sandbox", restaurantId] });
  if (q.isLoading) return <Loading what="the sandbox" />;
  if (q.error || !q.data) return <Failed error={q.error} />;
  const d = q.data;
  if (!d.sandbox) {
    return (
      <div className="rounded-xl border border-border p-4 text-sm">
        <p className="font-semibold">{name} is a real property</p>
        <p className="mt-1 text-muted-foreground">
          The sandbox never touches a real property. To try bookings from booking sites or give a
          partner a test key, onboard a separate test property: Hostel POS → Onboard, with{" "}
          <b>Sandbox test property</b> ticked.
        </p>
      </div>
    );
  }
  const types = d.property.roomTypes;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <FlaskConical className="mt-0.5 size-5 shrink-0 text-warning" />
        <p>
          <b>Test property.</b> Bookings here are marked sandbox and never reach a real hotel,
          booking site or guest. They show on this property&apos;s own Hostel POS screens (tape
          chart, bookings, rates), so you can watch the whole flow.
        </p>
      </div>
      {!types.length ? (
        <SampleRooms restaurantId={restaurantId} done={refresh} />
      ) : (
        <>
          <Simulator restaurantId={restaurantId} types={types} today={today} done={refresh} />
          <Ari ari={d.ari} />
          <Bookings restaurantId={restaurantId} bookings={d.bookings} done={refresh} />
        </>
      )}
      <Keys restaurantId={restaurantId} keys={d.keys} done={refresh} />
      <Docs firstType={types[0]?.id} />
      <Events events={d.events} />
    </div>
  );
}

function SampleRooms({ restaurantId, done }: { restaurantId: string; done: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-xl border border-border p-4">
      <p className="font-semibold">No rooms yet</p>
      <p className="text-sm text-muted-foreground">
        Load two dorms and a private room with three rate plans, or set up rooms in this
        property&apos;s Hostel POS.
      </p>
      <Button
        className="mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await sandboxLoadSample({
            data: { token: await consoleToken(), restaurantId },
          });
          setBusy(false);
          if (say(r, "Sample rooms loaded.")) done();
        }}
      >
        Load sample rooms
      </Button>
    </section>
  );
}

type RoomTypeInfo = {
  id: string;
  name: string;
  maxGuests: number;
  plans: { id: string; name: string }[];
};

function Simulator({
  restaurantId,
  types,
  today,
  done,
}: {
  restaurantId: string;
  types: RoomTypeInfo[];
  today: string;
  done: () => void;
}) {
  const [channel, setChannel] = useState<ChannelId>("booking_com");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const type = types.find((t) => t.id === typeId) ?? types[0];
  const [planId, setPlanId] = useState("");
  const [checkIn, setCheckIn] = useState(addDays(today, 3));
  const [nights, setNights] = useState(2);
  const [units, setUnits] = useState(1);
  const [name, setName] = useState("Test Guest");
  const [paid, setPaid] = useState(0);
  const [bookingId, setBookingId] = useState(
    () => `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  );
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!type) return;
    setBusy(true);
    const r = await sandboxSimulate({
      data: {
        token: await consoleToken(),
        restaurantId,
        booking: {
          channel,
          channelBookingId: bookingId,
          checkIn,
          checkOut: addDays(checkIn, nights),
          guest: { name, phone: "+919900000000" },
          rooms: [{ roomTypeId: type.id, units, guests: units, ...(planId ? { planId } : {}) }],
          ...(paid > 0 ? { paid } : {}),
        },
      },
    });
    setBusy(false);
    if (r.ok) {
      toast.success(
        r.data.created
          ? `Booked ${r.data.booking.reference}`
          : `Already booked as ${r.data.booking.reference} (same booking id)`,
      );
      setBookingId(`TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
      done();
    } else toast.error(r.error);
  };
  return (
    <section className="rounded-xl border border-border p-4">
      <p className="font-semibold">Channel simulator</p>
      <p className="text-sm text-muted-foreground">
        Send a booking as a booking site or the website would. Prices come from Hostel POS;
        stop-sell, minimum stay and closed to arrival/departure apply. Sending the same booking id
        twice returns the first booking.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={label}>
          From
          <select
            className={field}
            value={channel}
            onChange={(e) => setChannel(e.target.value as ChannelId)}
          >
            {CHANNELS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Room type
          <select
            className={field}
            value={type?.id ?? ""}
            onChange={(e) => {
              setTypeId(e.target.value);
              setPlanId("");
            }}
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Rate plan
          <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">{type?.plans[0]?.name ?? "Room only"}</option>
            {type?.plans.slice(1).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Beds or rooms
          <input
            type="number"
            min={1}
            max={20}
            className={field}
            value={units}
            onChange={(e) => setUnits(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className={label}>
          Check-in
          <input
            type="date"
            className={field}
            value={checkIn}
            min={today}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </label>
        <label className={label}>
          Nights
          <input
            type="number"
            min={1}
            max={60}
            className={field}
            value={nights}
            onChange={(e) => setNights(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className={label}>
          Guest name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={label}>
          Paid to the site (₹)
          <input
            type="number"
            min={0}
            className={field}
            value={paid}
            onChange={(e) => setPaid(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className={cn(label, "sm:col-span-2")}>
          Booking id on that site
          <input
            className={field}
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
          />
        </label>
      </div>
      <Button className="mt-3" disabled={busy || !type} onClick={() => void send()}>
        <Send />
        {busy ? "Sending…" : "Send booking"}
      </Button>
    </section>
  );
}

type AriData =
  Awaited<ReturnType<typeof sandboxOverview>> extends infer R
    ? R extends { sandbox: true; ari: infer A }
      ? A
      : never
    : never;

function Ari({ ari }: { ari: AriData }) {
  const nights = ari.roomTypes[0]?.nights ?? [];
  return (
    <section className="rounded-xl border border-border p-4">
      <p className="font-semibold">What booking sites see · next 14 nights</p>
      <p className="text-sm text-muted-foreground">
        Free count, room-only rate and restrictions, exactly as the API&apos;s /ari returns them.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-max text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card pr-3 text-left">Room type</th>
              {nights.map((n) => (
                <th key={n.date} className="px-1.5 font-semibold">
                  {n.date.slice(8)}/{n.date.slice(5, 7)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ari.roomTypes.map((t) => (
              <tr key={t.roomTypeId} className="border-t border-border">
                <td className="sticky left-0 max-w-48 truncate bg-card py-1.5 pr-3 font-medium">
                  {t.name}
                </td>
                {t.nights.map((n) => (
                  <td
                    key={n.date}
                    className="px-1.5 py-1.5 text-center tabular-nums"
                    title={`₹${n.rate}${n.minStay > 1 ? ` · min ${n.minStay}` : ""}${n.closedToArrival ? " · no arrivals" : ""}${n.closedToDeparture ? " · no departures" : ""}`}
                  >
                    <span
                      className={cn(
                        "block font-bold",
                        n.closed || n.available === 0 ? "text-destructive" : "",
                      )}
                    >
                      {n.closed ? "×" : n.available}
                    </span>
                    <span className="text-muted-foreground">₹{n.rate}</span>
                    {n.minStay > 1 || n.closedToArrival || n.closedToDeparture ? (
                      <span className="block text-[10px] text-warning">
                        {[
                          n.minStay > 1 ? `min${n.minStay}` : "",
                          n.closedToArrival ? "CTA" : "",
                          n.closedToDeparture ? "CTD" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type BookingRow = Extract<
  Awaited<ReturnType<typeof sandboxOverview>>,
  { sandbox: true }
>["bookings"][number];

function Bookings({
  restaurantId,
  bookings,
  done,
}: {
  restaurantId: string;
  bookings: BookingRow[];
  done: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, fn: () => Promise<Result<unknown>>, msg: string) => {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    if (say(r, msg)) done();
  };
  return (
    <section className="rounded-xl border border-border p-4">
      <p className="font-semibold">Sandbox bookings · {bookings.length}</p>
      <ul className="mt-2 divide-y divide-border text-sm">
        {bookings.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
            <span className="min-w-0 flex-1">
              <b>{b.reference}</b> · {b.guest.name} · {b.channel}
              {b.channelBookingId ? ` #${b.channelBookingId}` : ""}
              <span className="block text-xs text-muted-foreground">
                {b.checkIn} → {b.checkOut} ·{" "}
                {b.rooms
                  .map((r) => `${r.units} × ${r.roomType}${r.plan ? ` (${r.plan})` : ""}`)
                  .join(", ")}{" "}
                · ₹{b.roomTotalBeforeGst} before GST{b.paid ? ` · ₹${b.paid} paid` : ""}
              </span>
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-bold",
                b.status === "booked"
                  ? "bg-success/15 text-success"
                  : b.status === "cancelled"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-secondary",
              )}
            >
              {b.status.replace("_", " ")}
            </span>
            {b.status === "booked" ? (
              <span className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === b.id}
                  onClick={async () =>
                    act(
                      b.id,
                      async () =>
                        sandboxChange({
                          data: {
                            token: await consoleToken(),
                            restaurantId,
                            booking: b.id,
                            change: { checkOut: addDays(b.checkOut, 1) },
                          },
                        }),
                      "One night added.",
                    )
                  }
                >
                  +1 night
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === b.id}
                  onClick={async () =>
                    act(
                      b.id,
                      async () =>
                        sandboxChange({
                          data: {
                            token: await consoleToken(),
                            restaurantId,
                            booking: b.id,
                            change: {
                              checkIn: addDays(b.checkIn, 1),
                              checkOut: addDays(b.checkOut, 1),
                            },
                          },
                        }),
                      "Moved a day later.",
                    )
                  }
                >
                  Move +1 day
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === b.id}
                  onClick={async () =>
                    act(
                      b.id,
                      async () =>
                        sandboxCancel({
                          data: {
                            token: await consoleToken(),
                            restaurantId,
                            booking: b.id,
                            reason: "Guest cancelled on the booking site (sandbox)",
                          },
                        }),
                      "Cancelled.",
                    )
                  }
                >
                  Cancel
                </Button>
              </span>
            ) : null}
          </li>
        ))}
        {!bookings.length ? (
          <li className="py-2 text-muted-foreground">No sandbox bookings yet. Send one above.</li>
        ) : null}
      </ul>
    </section>
  );
}

type KeyRow = Extract<
  Awaited<ReturnType<typeof sandboxOverview>>,
  { sandbox: true }
>["keys"][number];

function Keys({
  restaurantId,
  keys,
  done,
}: {
  restaurantId: string;
  keys: KeyRow[];
  done: () => void;
}) {
  const [name, setName] = useState("");
  const [hook, setHook] = useState("");
  const [made, setMade] = useState<{ key: string; webhookSecret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = (t: string) =>
    void navigator.clipboard.writeText(t).then(() => toast.success("Copied."));
  return (
    <section className="rounded-xl border border-border p-4">
      <p className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4" />
        Partner test keys
      </p>
      <p className="text-sm text-muted-foreground">
        Give a channel manager or booking engine developer a key for this test property. The key and
        webhook secret show once; only a fingerprint is kept.
      </p>
      {made ? (
        <div className="mt-3 space-y-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
          <p className="font-semibold">Copy these now. They won&apos;t be shown again.</p>
          <p className="flex items-center gap-2 break-all font-mono text-xs">
            {made.key}
            <Button size="sm" variant="outline" onClick={() => copy(made.key)}>
              <Copy />
              Key
            </Button>
          </p>
          <p className="flex items-center gap-2 break-all font-mono text-xs">
            {made.webhookSecret}
            <Button size="sm" variant="outline" onClick={() => copy(made.webhookSecret)}>
              <Copy />
              Secret
            </Button>
          </p>
          <Button size="sm" variant="ghost" onClick={() => setMade(null)}>
            Done
          </Button>
        </div>
      ) : null}
      <form
        className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await sandboxCreateKey({
            data: {
              token: await consoleToken(),
              restaurantId,
              name,
              webhookUrl: hook.trim() || null,
            },
          });
          setBusy(false);
          if (say(r, "Key made.")) {
            setMade(r.data);
            setName("");
            setHook("");
            done();
          }
        }}
      >
        <label className={label}>
          Partner
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme channel manager"
          />
        </label>
        <label className={label}>
          Webhook address (optional, https)
          <input
            className={field}
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="https://partner.example.com/xtsy/webhook"
          />
        </label>
        <Button type="submit" disabled={busy || name.trim().length < 2}>
          Make a key
        </Button>
      </form>
      <ul className="mt-3 divide-y divide-border text-sm">
        {keys.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
            <span className="min-w-0 flex-1">
              <b>{k.name}</b> <span className="font-mono text-xs">{k.prefix}</span>
              <span className="block text-xs text-muted-foreground">
                {k.webhookUrl ? `Webhook ${new URL(k.webhookUrl).host}` : "No webhook"} · made{" "}
                {new Date(k.createdAt).toLocaleDateString("en-IN")} ·{" "}
                {k.lastUsedAt
                  ? `last used ${new Date(k.lastUsedAt).toLocaleString("en-IN")}`
                  : "not used yet"}
              </span>
            </span>
            {k.revokedAt ? (
              <span className="text-xs font-semibold text-destructive">Revoked</span>
            ) : (
              <span className="flex gap-1.5">
                {k.webhookUrl ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const r = await sandboxTestWebhook({
                        data: { token: await consoleToken(), restaurantId, keyId: k.id },
                      });
                      if (say(r, "Test webhook sent; see the log below.")) done();
                    }}
                  >
                    Send test webhook
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const r = await sandboxRevokeKey({
                      data: { token: await consoleToken(), restaurantId, keyId: k.id },
                    });
                    if (say(r, "Key revoked.")) done();
                  }}
                >
                  Revoke
                </Button>
              </span>
            )}
          </li>
        ))}
        {!keys.length ? <li className="py-2 text-muted-foreground">No keys yet.</li> : null}
      </ul>
    </section>
  );
}

function Docs({ firstType }: { firstType: string | undefined }) {
  const example = `curl -X POST ${API}/bookings \\
  -H "Authorization: Bearer xsb_test_…" -H "Content-Type: application/json" \\
  -d '{"channel":"booking_com","channelBookingId":"BK-1001",
       "checkIn":"2026-12-24","checkOut":"2026-12-26",
       "guest":{"name":"Asha Rao","phone":"+919876543210"},
       "rooms":[{"roomTypeId":"${firstType ?? "<room type id>"}","units":1,"guests":1}],
       "paid":0}'`;
  return (
    <section className="rounded-xl border border-border p-4 text-sm">
      <p className="font-semibold">Sandbox API · v1</p>
      <p className="text-muted-foreground">
        Base address <span className="font-mono text-xs">{API}</span>. JSON in and out; send the key
        as <span className="font-mono text-xs">Authorization: Bearer xsb_test_…</span>.
      </p>
      <ul className="mt-2 space-y-1 font-mono text-xs">
        <li>GET /property: room types, plans and how they&apos;re sold</li>
        <li>
          GET /ari?from=YYYY-MM-DD&amp;days=14: free count, rates, min stay, CTA/CTD per night (up
          to 90)
        </li>
        <li>GET /bookings?from=&amp;to=: sandbox bookings</li>
        <li>
          POST /bookings: new booking; the same channel + channelBookingId returns the first one
          (200 instead of 201)
        </li>
        <li>GET /bookings/:idOrReference</li>
        <li>PATCH /bookings/:idOrReference: {"{ checkIn?, checkOut?, guest? }"}</li>
        <li>POST /bookings/:idOrReference/cancel: {"{ reason }"}</li>
      </ul>
      <p className="mt-2 text-muted-foreground">
        Channels: {CHANNELS.map((c) => c.id).join(", ")}. Errors come back as {"{ error }"} with 400
        (bad request), 401 (key), 403 (not a test property), 404, 409 (not available / restriction /
        can&apos;t change now).
      </p>
      <p className="mt-2 text-muted-foreground">
        Webhooks: POST to your address with <span className="font-mono text-xs">X-XTSY-Event</span>{" "}
        (booking.created, booking.modified, booking.cancelled, test) and{" "}
        <span className="font-mono text-xs">X-XTSY-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</span>,
        HMAC-SHA256 of <span className="font-mono text-xs">&lt;t&gt;.&lt;raw body&gt;</span> with
        your webhook secret. Reject anything older than 5 minutes. Sent once, not retried.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-secondary/70 p-3 text-xs">{example}</pre>
    </section>
  );
}

type EventRow = Extract<
  Awaited<ReturnType<typeof sandboxOverview>>,
  { sandbox: true }
>["events"][number];

function Events({ events }: { events: EventRow[] }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <p className="font-semibold">Event log · latest {events.length}</p>
      <ul className="mt-2 max-h-96 divide-y divide-border overflow-auto text-xs">
        {events.map((e) => (
          <li key={e.id} className="py-1.5">
            <span className="text-muted-foreground">
              {new Date(e.at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>{" "}
            <b
              className={cn(
                e.kind.endsWith("refused") || e.kind.endsWith("failed") ? "text-destructive" : "",
              )}
            >
              {e.kind}
            </b>{" "}
            · {e.source}
            {e.detail ? (
              <span className="block break-words text-muted-foreground">{e.detail}</span>
            ) : null}
          </li>
        ))}
        {!events.length ? <li className="py-2 text-muted-foreground">Nothing yet.</li> : null}
      </ul>
    </section>
  );
}
