/**
 * Swiggy and Zomato on XTSY POS. Pure rules, tested in aggregator-logic.test.ts.
 *
 * Partner API keys don't exist yet, so only the SANDBOX is real: the super admin turns it on per
 * restaurant (console → restaurant → Integrations) and drops test orders into that restaurant's
 * online-order inbox. They arrive on its POS exactly like a platform order will (paid on the
 * platform, delivery, a Swiggy/Zomato bill with the platform's prices and GST rule) and are
 * marked as tests everywhere. "Live" is refused in the cloud until the keys exist.
 *
 * Plans: Pro Lite, Pro and Enterprise / Brand carry `aggregators`; Basic never does.
 */
import type { OrderType } from "./types";

export type Platform = "swiggy" | "zomato";
export type IntegrationMode = "off" | "sandbox" | "live";
export const PLATFORMS: Platform[] = ["swiggy", "zomato"];
export const PLATFORM_NAMES: Record<Platform, string> = { swiggy: "Swiggy", zomato: "Zomato" };

export interface IntegrationLink { platform: Platform; mode: IntegrationMode; storeId: string; updatedAt?: string }
export interface SandboxOrderRow { code: string; platform: Platform; status: string; subtotal: number; billNo: string | null; at: string }

/** The guest-order fields this module reads. */
export interface PlatformOrderFields {
  platform?: Platform | null;
  is_test?: boolean | null;
}

export function isPlatform(value: unknown): value is Platform {
  return value === "swiggy" || value === "zomato";
}

/** Which platform an incoming order came from, or null for the restaurant's own QR/online orders. */
export function guestPlatform(order: PlatformOrderFields): Platform | null {
  return isPlatform(order.platform) ? order.platform : null;
}

/** The bill's order type: a platform order is billed as Swiggy/Zomato (their prices, their GST rule). */
export function platformOrderType(order: PlatformOrderFields, fallback: OrderType): OrderType {
  return guestPlatform(order) ?? fallback;
}

/** "Swiggy", "Zomato · sandbox test", or "" for the restaurant's own orders. */
export function platformBadge(order: PlatformOrderFields): string {
  const p = guestPlatform(order);
  if (!p) return "";
  return order.is_test ? `${PLATFORM_NAMES[p]} · sandbox test` : PLATFORM_NAMES[p];
}

/** Whether a plan (by its feature switches) may turn Swiggy/Zomato on at all. */
export function planAllowsAggregators(features: Partial<Record<string, boolean>> | null | undefined): boolean {
  return features?.["aggregators"] === true;
}

/** Why the console can't set this mode, or null when it can. Mirrors platform_set_integration. */
export function integrationModeProblem(mode: IntegrationMode, planAllows: boolean): string | null {
  if (mode === "off") return null;
  if (!planAllows) return "Swiggy and Zomato are on Pro Lite and above. Move this restaurant off Basic first.";
  if (mode === "live") return "Live needs the platform's partner API keys, which aren't set up yet. Use sandbox until then.";
  return null;
}

export function linkFor(links: IntegrationLink[], platform: Platform): IntegrationLink {
  return links.find((l) => l.platform === platform) ?? { platform, mode: "off", storeId: "" };
}

/** A dish as the console's sandbox picker sees it (platform_menu_dishes). */
export interface SandboxDish {
  id: string;
  name: string;
  category?: string | null;
  price?: number | null;
  prices?: Partial<Record<string, number>> | null;
  veg?: boolean | null;
  available?: boolean | null;
  variantId?: string | null;
  variantPrice?: number | null;
}

export interface SandboxLine { itemId: string; variantId?: string; qty: number; name: string; price: number; veg: boolean; addonIds: string[] }

/** What the platform would charge for a dish: its first portion, else its platform price, else its price. */
export function sandboxPrice(dish: SandboxDish, platform: Platform): number {
  if (dish.variantId) return Number(dish.variantPrice) || 0;
  const own = dish.prices?.[platform];
  return Number(typeof own === "number" && own > 0 ? own : dish.price) || 0;
}

/** Dishes that can go on a test order: available, named, priced. */
export function sandboxDishes(menu: SandboxDish[], platform: Platform): SandboxDish[] {
  return menu.filter((d) => d.id && (d.name ?? "").trim() && d.available !== false && sandboxPrice(d, platform) > 0);
}

/** The lines of a test order from the picked dishes (id → quantity). Max 30 lines, as the cloud allows. */
export function sandboxLines(menu: SandboxDish[], picks: Record<string, number>, platform: Platform): SandboxLine[] {
  const byId = new Map(sandboxDishes(menu, platform).map((d) => [d.id, d]));
  const lines: SandboxLine[] = [];
  for (const [id, qty] of Object.entries(picks)) {
    const dish = byId.get(id);
    const n = Math.floor(qty);
    if (!dish || n <= 0) continue;
    lines.push({ itemId: dish.id, ...(dish.variantId ? { variantId: dish.variantId } : {}), qty: Math.min(n, 20), name: dish.name.trim(), price: sandboxPrice(dish, platform), veg: dish.veg === true, addonIds: [] });
  }
  return lines.slice(0, 30);
}

/** A quick test order: up to `count` different available dishes, one of each. */
export function quickSandboxPicks(menu: SandboxDish[], platform: Platform, count = 3): Record<string, number> {
  return Object.fromEntries(sandboxDishes(menu, platform).slice(0, count).map((d) => [d.id, 1]));
}

export function sandboxTotal(lines: SandboxLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
}
