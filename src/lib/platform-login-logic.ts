/**
 * Super admin: rules for restaurant logins. Pure, tested.
 *
 * Restaurant logins are internal accounts with made-up (dummy) email addresses such as
 * billdesk2@tabbistro.pos: nobody receives mail there, they are created already confirmed.
 * The super admin can create them on any domain, rename them, change their role, reset
 * their password and switch their sign-in off or on.
 */

export type StaffRole = "owner" | "manager" | "cashier" | "captain" | "kitchen";

export const STAFF_ROLES: { v: StaffRole; l: string; app: string }[] = [
  { v: "owner", l: "Owner (admin)", app: "POS Manager + every app" },
  { v: "manager", l: "Manager", app: "POS Manager + every app" },
  { v: "cashier", l: "Billdesk", app: "POS Billdesk" },
  { v: "captain", l: "Waiter", app: "Waiter Pro" },
  { v: "kitchen", l: "Kitchen", app: "POS Billdesk (kitchen screen)" },
];

export const isStaffRole = (v: string): v is StaffRole => STAFF_ROLES.some((r) => r.v === v);

/** The address as stored: trimmed, lower case. */
export const cleanEmail = (text: string) => text.trim().toLowerCase();

/** Why this login address can't be used, or null. Any domain is fine, made-up ones included. */
export function emailProblem(text: string): string | null {
  const e = cleanEmail(text);
  if (!e) return "Enter the login email.";
  if (e.length > 120) return "Keep the email under 120 characters.";
  if (!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(e)) {
    return "Use a login like billdesk2@tabbistro.pos (letters, numbers, dots; a domain with a dot).";
  }
  return null;
}

/** "billdesk@xtsy.pos" → suggested next login for a role on the restaurant's own domain. */
export function suggestEmail(role: StaffRole, taken: string[], domain: string): string {
  const base = role === "cashier" ? "billdesk" : role === "captain" ? "waiter" : role === "owner" ? "admin" : role;
  const used = new Set(taken.map(cleanEmail));
  for (let n = 1; n < 100; n += 1) {
    const e = `${base}${n === 1 ? "" : n}@${domain}`;
    if (!used.has(e)) return e;
  }
  return `${base}${Date.now() % 10000}@${domain}`;
}

/** The domain most of a restaurant's logins use (its own made-up domain), else xtsy.pos. */
export function restaurantDomain(emails: string[]): string {
  const count = new Map<string, number>();
  for (const e of emails) {
    const d = cleanEmail(e).split("@")[1];
    if (d) count.set(d, (count.get(d) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "xtsy.pos";
}

/** A restaurant must always keep at least one owner who can sign in. */
export function wouldLeaveNoOwner(staff: { userId: string; role: string; signInOff: boolean }[], change: { userId: string; role?: string; signInOff?: boolean; remove?: boolean }): boolean {
  const after = staff
    .filter((s) => !(change.remove && s.userId === change.userId))
    .map((s) => s.userId === change.userId ? { ...s, role: change.role ?? s.role, signInOff: change.signInOff ?? s.signInOff } : s);
  return !after.some((s) => s.role === "owner" && !s.signInOff);
}
