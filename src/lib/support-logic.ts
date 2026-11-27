/**
 * "Sign in as" — XTSY support opening a restaurant user's own app from the console. Pure rules,
 * tested in support-logic.test.ts. The flow:
 *
 * 1. Console → product → restaurant → Users → "Sign in as" with a reason (required).
 * 2. A server function checks the super admin, that the login belongs to the restaurant and
 *    can sign in, logs `support_sign_in` (who, whom, why) in account_events, and returns a
 *    one-time session for that login. No password is seen or set.
 * 3. The console hands the session to a new tab at /support through localStorage (same origin,
 *    read once, 2-minute expiry) — never in the address bar.
 * 4. /support refuses if this browser holds another outlet's unsynced work or a running bill,
 *    clears local data otherwise (prepareOutletSwitch), signs in and opens that user's app.
 * 5. While it lasts the app shows a support banner; the device is not registered as a terminal
 *    and writes carry a "xtsy-support-…" device id, so the restaurant's audit log shows them.
 */
import { APPS, appsFor, loginForEmail, type AppKind } from "./staff-login-logic";
import { spaced } from "@/lib/app-space";

export const SUPPORT_KEY = spaced("xtsy-support");
export const HANDOFF_KEY = "xtsy-support-handoff";
export const HANDOFF_TTL_MS = 2 * 60_000;
export const MIN_REASON = 8;

export interface SupportHandoff {
  accessToken: string;
  refreshToken: string;
  restaurantId: string;
  restaurantName: string;
  email: string;
  role: string;
  displayName: string;
  reason: string;
  by: string;
  at: number;
}

export interface SupportSession { restaurantId: string; restaurantName: string; email: string; role: string; displayName: string; reason: string; by: string; startedAt: number }

export function supportReasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < MIN_REASON) return `Say why you're signing in (at least ${MIN_REASON} characters). It's kept in the restaurant's history.`;
  if (r.length > 200) return "Keep the reason under 200 characters.";
  return null;
}

/** Which app the user's own console page is: the first app their login may open. */
export function supportAppFor(email: string, role: string): AppKind {
  return appsFor(loginForEmail(email), role)[0] ?? "manager";
}

export function supportHome(email: string, role: string): string {
  return role === "kitchen" ? "/tables" : APPS[supportAppFor(email, role)].home;
}

/** A handoff is used once and only while fresh. */
export function readHandoff(raw: string | null, now = Date.now()): SupportHandoff | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as Partial<SupportHandoff>;
    if (typeof h.accessToken !== "string" || typeof h.refreshToken !== "string" || typeof h.restaurantId !== "string" || typeof h.at !== "number") return null;
    if (now - h.at > HANDOFF_TTL_MS || h.at > now + 5_000) return null;
    return { restaurantName: "", email: "", role: "", displayName: "", reason: "", by: "", ...h } as SupportHandoff;
  } catch { return null; }
}

export function sessionFromHandoff(h: SupportHandoff, now = Date.now()): SupportSession {
  return { restaurantId: h.restaurantId, restaurantName: h.restaurantName, email: h.email, role: h.role, displayName: h.displayName, reason: h.reason, by: h.by, startedAt: now };
}

export function readSupport(raw: string | null): SupportSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<SupportSession>;
    return typeof s.restaurantId === "string" && typeof s.email === "string" ? (s as SupportSession) : null;
  } catch { return null; }
}

/** The support banner line. */
export function supportBannerText(s: SupportSession): string {
  const who = s.displayName && s.displayName !== s.email ? `${s.displayName} (${s.email})` : s.email;
  return `XTSY support · signed in as ${who} at ${s.restaurantName || "this restaurant"}`;
}
