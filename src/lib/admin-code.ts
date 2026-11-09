/*
 * Admin code: a 6-digit code that changes every 60 seconds (time-based one-time code, HMAC-SHA256).
 * The admin's device shows it; a staff terminal checks it on its own, with no internet and no cloud call.
 * Both sides only need the same secret (set up once in Settings → Roles, shared with the restaurant
 * settings) and roughly the right time. A code is accepted once per terminal.
 */

export const ADMIN_CODE_STEP_MS = 60_000;
export const ADMIN_CODE_DIGITS = 6;
/** Codes from one step either side are accepted, for clocks a little out. */
const DRIFT_STEPS = 1;

export interface AdminCodeKey { secret: string; createdAt: number }

const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) ?? []).map((b) => parseInt(b, 16)));
const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A new random 160-bit secret. Making a new one stops every older code at once. */
export function newAdminCodeKey(now = Date.now()): AdminCodeKey {
  return { secret: toHex(crypto.getRandomValues(new Uint8Array(20))), createdAt: now };
}

export function isAdminCodeKey(value: unknown): value is AdminCodeKey {
  return !!value && typeof value === "object" && /^[0-9a-f]{40}$/.test(String((value as AdminCodeKey).secret)) && typeof (value as AdminCodeKey).createdAt === "number";
}

export const stepAt = (now: number) => Math.floor(now / ADMIN_CODE_STEP_MS);

/** The code for one 60-second step. */
export async function codeForStep(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", fromHex(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const counter = new Uint8Array(8);
  let n = step;
  for (let i = 7; i >= 0; i -= 1) { counter[i] = n & 0xff; n = Math.floor(n / 256); }
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const bin = (((mac[offset] ?? 0) & 0x7f) << 24) | ((mac[offset + 1] ?? 0) << 16) | ((mac[offset + 2] ?? 0) << 8) | (mac[offset + 3] ?? 0);
  return String(bin % 10 ** ADMIN_CODE_DIGITS).padStart(ADMIN_CODE_DIGITS, "0");
}

/** The code showing now, and seconds until it changes. */
export async function currentAdminCode(secret: string, now = Date.now()): Promise<{ code: string; secondsLeft: number }> {
  return { code: await codeForStep(secret, stepAt(now)), secondsLeft: Math.ceil((ADMIN_CODE_STEP_MS - (now % ADMIN_CODE_STEP_MS)) / 1000) };
}

/**
 * Checks a typed code. Returns the step it matched, or null. lastUsedStep stops the same code (or an
 * older one) being used twice on this terminal.
 */
export async function checkAdminCode(code: string, key: AdminCodeKey | null | undefined, now = Date.now(), lastUsedStep = -1): Promise<number | null> {
  if (!key || !/^\d{6}$/.test(code)) return null;
  const here = stepAt(now);
  for (let step = here - DRIFT_STEPS; step <= here + DRIFT_STEPS; step += 1) {
    if (step <= lastUsedStep || step < stepAt(key.createdAt)) continue;
    const expected = await codeForStep(key.secret, step);
    let diff = 0;
    for (let i = 0; i < ADMIN_CODE_DIGITS; i += 1) diff |= expected.charCodeAt(i) ^ code.charCodeAt(i);
    if (diff === 0) return step;
  }
  return null;
}

const USED_KEY = "xtsy-admin-code-used";
export function lastUsedStep(): number {
  try { const v = Number(window.localStorage.getItem(USED_KEY)); return Number.isFinite(v) ? v : -1; } catch { return -1; }
}
export function markStepUsed(step: number): void {
  try { window.localStorage.setItem(USED_KEY, String(Math.max(step, lastUsedStep()))); } catch { /* storage unavailable */ }
}
