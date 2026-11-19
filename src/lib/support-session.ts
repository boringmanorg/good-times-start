/* Browser side of a support session (see support-logic.ts). */
import { readSupport, SUPPORT_KEY, type SupportSession } from "./support-logic";

export function currentSupport(): SupportSession | null {
  try { return readSupport(window.localStorage.getItem(SUPPORT_KEY)); } catch { return null; }
}
export function isSupportSession(): boolean {
  return currentSupport() !== null;
}
export function beginSupport(s: SupportSession): void {
  try { window.localStorage.setItem(SUPPORT_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function clearSupport(): void {
  try { window.localStorage.removeItem(SUPPORT_KEY); } catch { /* storage unavailable */ }
}
