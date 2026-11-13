import { toast } from "sonner";
import { ROLE_LABELS } from "./staff";
import { can, currentAdminCodeKey, needsPin, type Action } from "./permissions";

/*
 * One admin-code prompt for the whole app. allow() is called before any action the
 * admin can switch per role: it says no (Off), goes ahead (On), or asks for
 * the admin's current 60-second code on this device (On with admin code).
 */

type Request = { label: string; resolve: (ok: boolean) => void };
let pending: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export function subscribePin(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function currentPinRequest(): Request | null { return pending; }

export function askPin(label: string): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { label, resolve: (ok) => { pending = null; emit(); resolve(ok); } };
    emit();
  });
}

type Who = { role: string } | null | undefined;

export async function allow(user: Who, action: Action, label: string): Promise<boolean> {
  const role = user?.role as keyof typeof ROLE_LABELS | undefined;
  if (!can(user as never, action)) {
    toast.error(`${role && ROLE_LABELS[role] ? ROLE_LABELS[role] : "This login"} can't do this: ${label.toLowerCase()}. Ask the admin.`);
    return false;
  }
  if (!needsPin(user as never, action)) return true;
  if (!currentAdminCodeKey()) {
    toast.error("This needs the admin code, but it isn't set up yet. The admin can set it up in Settings → Roles.");
    return false;
  }
  return askPin(label);
}
