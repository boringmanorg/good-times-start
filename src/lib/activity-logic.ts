/**
 * The console's activity log in plain words (platform_activity → account_events). Pure, tested
 * in activity-logic.test.ts. Each confirmed action becomes ONE line a person can read at a glance
 * ("Pro Lite: price ₹399 → ₹449"), with at most a few short details under it. Saves that changed
 * nothing are dropped, so the log only holds things that actually happened.
 */
import { FEATURE_NAMES, type Feature } from "./plans";

export interface ActivityEvent {
  id: number;
  at: string;
  kind: string;
  detail: Record<string, unknown> | null;
  amount?: number | null;
  outlet?: string | null;
  actor?: string | null;
}

export type ActivityArea = "plans" | "billing" | "outlet" | "users" | "devices" | "integrations";
export const AREAS: { v: ActivityArea | "all"; l: string }[] = [
  { v: "all", l: "Everything" },
  { v: "plans", l: "Plan catalogue" },
  { v: "billing", l: "Subscriptions & payments" },
  { v: "outlet", l: "Outlets" },
  { v: "users", l: "Logins & support" },
  { v: "devices", l: "Devices" },
  { v: "integrations", l: "Swiggy & Zomato" },
];

export interface ActivityLine {
  area: ActivityArea;
  title: string;
  details: string[];
  tone: "normal" | "money" | "warn" | "support";
}

type D = Record<string, unknown>;
const obj = (v: unknown): D => (v && typeof v === "object" && !Array.isArray(v) ? (v as D) : {});
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const rupees = (v: unknown): string => `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (v: unknown): string => {
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "no end date";
};
const featureName = (f: string): string => FEATURE_NAMES[f as Feature] ?? f.replace(/_/g, " ");
const STATUS: Record<string, string> = { active: "Active", trialing: "Trial", past_due: "Payment due", suspended: "Paused", cancelled: "Ended" };
const METHOD: Record<string, string> = { upi: "UPI", cash: "cash", bank: "bank transfer", card: "card", other: "other" };
const ROLE: Record<string, string> = { owner: "Owner", manager: "Manager", cashier: "Billdesk", captain: "Waiter", kitchen: "Kitchen" };
const PLATFORM: Record<string, string> = { swiggy: "Swiggy", zomato: "Zomato" };
const MODE: Record<string, string> = { off: "off", sandbox: "sandbox", live: "live" };
const SEAT_FIELD: Record<string, string> = { billdesk_seats: "Billdesk devices", waiter_seats: "Waiter devices", admin_seats: "Admin devices" };
const seatsText = (v: unknown): string => (v === null || v === undefined ? "unlimited" : String(v));

function catalogue(d: D, plans: Record<string, string>): ActivityLine | null {
  const name = str(d["planName"]) || plans[str(d["plan"])] || str(d["plan"]);
  const changes = Array.isArray(d["changes"]) ? (d["changes"] as D[]) : [];
  if (d["op"] === "insert") return { area: "plans", title: `New plan added: ${name}`, details: [], tone: "warn" };
  if (d["op"] === "delete") return { area: "plans", title: `Plan removed: ${name}`, details: [], tone: "warn" };
  if (!changes.length) return null;
  const on: string[] = [], off: string[] = [], other: string[] = [];
  for (const c of changes) {
    const f = str(c["field"]);
    if (f.startsWith("feature:")) (c["to"] === true ? on : off).push(featureName(f.slice(8)));
    else if (f === "monthly_price") other.push(`price ${rupees(c["from"])} → ${rupees(c["to"])}`);
    else if (SEAT_FIELD[f]) other.push(`${SEAT_FIELD[f]} ${seatsText(c["from"])} → ${seatsText(c["to"])}`);
    else if (f === "active") other.push(c["to"] ? "now offered" : "no longer offered");
    else if (f === "quote") other.push(c["to"] ? "now 'call for quote'" : "price shown again");
    else if (f === "name") other.push(`renamed from ${str(c["from"])}`);
    else if (f === "max_outlets") other.push(`outlets ${seatsText(c["from"])} → ${seatsText(c["to"])}`);
    else if (f === "tagline") other.push("tagline changed");
  }
  const details = [...(on.length ? [`Turned on: ${on.join(", ")}`] : []), ...(off.length ? [`Turned off: ${off.join(", ")}`] : [])];
  const head = other.length ? `${name}: ${other.join(", ")}` : `${name}: features changed`;
  return { area: "plans", title: head, details, tone: "warn" };
}

function account(d: D, plans: Record<string, string>): ActivityLine | null {
  const from = obj(d["from"]), to = obj(d["to"]);
  const parts: string[] = [];
  const details: string[] = [];
  const pn = (id: unknown) => plans[str(id)] ?? str(id);
  if (from["plan"] !== to["plan"]) parts.push(`plan ${pn(from["plan"])} → ${pn(to["plan"])}`);
  if (from["status"] !== to["status"]) parts.push(`status ${STATUS[str(from["status"])] ?? str(from["status"])} → ${STATUS[str(to["status"])] ?? str(to["status"])}`);
  if (str(from["paidUntil"]).slice(0, 10) !== str(to["paidUntil"]).slice(0, 10)) parts.push(`paid until ${day(from["paidUntil"])} → ${day(to["paidUntil"])}`);
  if (Boolean(from["complimentary"]) !== Boolean(to["complimentary"])) parts.push(to["complimentary"] ? "made complimentary" : "no longer complimentary");
  const fa = obj(from["features"]), fb = obj(to["features"]);
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    if (fa[k] === fb[k]) continue;
    details.push(`${featureName(k)}: ${fb[k] === undefined ? "follows the plan" : fb[k] ? "switched on for this outlet" : "switched off for this outlet"}`);
  }
  const sa = obj(from["seats"]), sb = obj(to["seats"]);
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (sa[k] === sb[k]) continue;
    const label = k === "pos" ? "Billdesk" : k === "waiter" ? "Waiter" : "Admin";
    details.push(`${label} devices: ${sb[k] === undefined ? "follows the plan" : String(sb[k])}`);
  }
  if (!parts.length && !details.length) return null;
  return { area: "billing", title: parts.length ? `Subscription: ${parts.join(", ")}` : "Subscription: outlet switches changed", details, tone: "normal" };
}

/** One readable line for an event, or null for a save that changed nothing. */
export function describeActivity(e: ActivityEvent, plans: Record<string, string> = {}): ActivityLine | null {
  const d = obj(e.detail);
  switch (e.kind) {
    case "catalogue_changed":
      return catalogue(d, plans);
    case "plan_changed":
      return account(d, plans);
    case "payment_recorded":
      return {
        area: "billing", tone: "money",
        title: `Payment recorded: ${rupees(d["amount"])} by ${METHOD[str(d["method"])] ?? str(d["method"])} for ${str(d["months"])} month${d["months"] === 1 ? "" : "s"}`,
        details: [`Paid until ${day(d["until"])}`, ...(str(d["reference"]) ? [`Ref ${str(d["reference"])}`] : [])],
      };
    case "onboarded":
      return { area: "outlet", tone: "normal", title: `Outlet onboarded on ${plans[str(d["plan"])] ?? str(d["plan"])}`, details: str(d["owner"]) ? [`Owner login ${str(d["owner"])}`] : [] };
    case "info_changed": {
      const from = obj(d["from"]), to = obj(d["to"]);
      const parts: string[] = [];
      if (from["name"] !== to["name"]) parts.push(`name "${str(from["name"])}" → "${str(to["name"])}"`);
      if (from["slug"] !== to["slug"]) parts.push(`QR address /${str(from["slug"])} → /${str(to["slug"])}`);
      if (from["city"] !== to["city"]) parts.push(`city ${str(from["city"]) || "—"} → ${str(to["city"]) || "—"}`);
      if (!parts.length) return null;
      return { area: "outlet", tone: from["slug"] !== to["slug"] ? "warn" : "normal", title: `Outlet info: ${parts.join(", ")}`, details: from["slug"] !== to["slug"] ? ["Printed QR cards with the old address stop working"] : [] };
    }
    case "login_changed": {
      const email = str(d["email"]);
      const action = str(d["action"]);
      if (action === "created") return { area: "users", tone: "normal", title: `Login added: ${email}`, details: [ROLE[str(d["role"])] ?? str(d["role"])] };
      if (action === "removed") return { area: "users", tone: "warn", title: `Login removed: ${email}`, details: [] };
      const details: string[] = [];
      if (d["from"]) details.push(`Was ${str(d["from"])}`);
      if (d["role"]) details.push(`Role: ${ROLE[str(d["role"])] ?? str(d["role"])}`);
      if (d["password"]) details.push("Password reset");
      if (d["signIn"]) details.push(d["signIn"] === "on" ? "Sign-in switched on" : "Sign-in switched off");
      return { area: "users", tone: d["signIn"] === "off" ? "warn" : "normal", title: `Login changed: ${email}`, details };
    }
    case "support_sign_in":
      return { area: "users", tone: "support", title: `Signed in as ${str(d["email"])} (${ROLE[str(d["role"])] ?? str(d["role"])})`, details: [`Reason: ${str(d["reason"])}`] };
    case "device_changed": {
      const action = str(d["action"]);
      const verb = action === "release" ? "released" : action === "blocked" ? "blocked" : "activated";
      return { area: "devices", tone: action === "blocked" ? "warn" : "normal", title: `Device ${verb}: ${str(d["device"])}`, details: [] };
    }
    case "integration_changed":
      return { area: "integrations", tone: "normal", title: `${PLATFORM[str(d["platform"])] ?? str(d["platform"])} ${d["mode"] === "off" ? "switched off" : `${MODE[str(d["mode"])] ?? str(d["mode"])} switched on`}`, details: str(d["store_id"]) ? [`Store id ${str(d["store_id"])}`] : [] };
    case "sandbox_order":
      return { area: "integrations", tone: "normal", title: `${PLATFORM[str(d["platform"])] ?? ""} test order ${str(d["code"])} sent · ${rupees(d["subtotal"])}`, details: [] };
    default:
      return { area: "outlet", tone: "normal", title: e.kind.replace(/_/g, " "), details: [] };
  }
}

/** "Super admin", "System (no one signed in)" or the email of whoever acted. */
export function actorText(actor: string | null | undefined): string {
  return actor ? actor : "System (database, no one signed in)";
}

/** Day heading for grouping: "Today", "Yesterday", "Wed, 18 Nov 2026" (India time). */
export function activityDay(at: string, now = Date.now()): string {
  const key = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const t = Date.parse(at);
  if (key(t) === key(now)) return "Today";
  if (key(t) === key(now - 86_400_000)) return "Yesterday";
  return new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/* Drift: the cloud catalogue against the ladder in plans.ts. */
export interface Drift { plan: string; name: string; feature: string; expected: boolean; actual: boolean }

export function catalogueDrift(rows: { id: string; name: string; features: Partial<Record<string, boolean>> }[], ladder: Record<string, string[]>, all: readonly string[]): Drift[] {
  const out: Drift[] = [];
  for (const row of rows) {
    const want = ladder[row.id];
    if (!want) continue;
    for (const f of all) {
      const expected = want.includes(f);
      const actual = row.features[f] === true;
      if (expected !== actual) out.push({ plan: row.id, name: row.name, feature: f, expected, actual });
    }
  }
  return out;
}
