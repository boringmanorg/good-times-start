import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDevices } from "./fakes/fake-dexie";
vi.mock("dexie", async () => ({ default: (await import("./fakes/fake-dexie")).default }));

const calls: { table: string; op: string; row: unknown }[] = [];
let online = true;
let refuse = false;
const result = () => (online ? (refuse ? { data: null, error: { code: "42501", message: "row-level security" } } : { data: [{ id: "r1" }], error: null }) : { data: null, error: { message: "TypeError: Failed to fetch" } });
const chain = (table: string, op: string, row: unknown) => {
  calls.push({ table, op, row });
  const c: Record<string, unknown> = {};
  for (const m of ["eq", "select", "order", "limit", "gte", "maybeSingle", "single"]) c[m] = () => c;
  (c as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => ({ update: (row: unknown) => chain(table, "update", row), upsert: (row: unknown) => chain(table, "upsert", row), insert: (row: unknown) => chain(table, "insert", row), select: () => chain(table, "select", null) }), rpc: async () => ({ data: null, error: null }) },
}));

let actions: typeof import("@/lib/marketing-actions");
let access: typeof import("@/lib/marketing-access");
let db: typeof import("@/lib/db");
beforeAll(async () => { actions = await import("@/lib/marketing-actions"); access = await import("@/lib/marketing-access"); db = await import("@/lib/db"); });
beforeEach(() => { fakeDevices.reset(); calls.length = 0; online = true; refuse = false; Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online }); });

describe("marketing terminal access", () => {
  it("opens only for owners and managers on a terminal the admin enabled", () => {
    expect(access.marketingAccess("cashier", { marketingDevices: ["dev-12345678"] }, "dev-12345678")).toBe("role");
    expect(access.marketingAccess("owner", {}, "dev-12345678")).toBe("terminal");
    expect(access.marketingAccess("manager", { marketingDevices: ["other-123456"] }, "dev-12345678")).toBe("terminal");
    expect(access.marketingAccess("owner", { marketingDevices: ["dev-12345678"] }, null)).toBe("loading");
    expect(access.marketingAccess("manager", { marketingDevices: ["dev-12345678"] }, "dev-12345678")).toBeNull();
  });
  it("only an admin can enable a terminal, and the list is saved in the shared settings", async () => {
    await expect(access.setMarketingTerminal({ role: "cashier" }, "dev-12345678", true)).rejects.toThrow(/owner or a manager/);
    await access.setMarketingTerminal({ role: "owner" }, "dev-12345678", true);
    expect((await db.getSettings()).marketingDevices).toEqual(["dev-12345678"]);
    expect(await db.getDb().outbox.count()).toBeGreaterThan(0);
    await access.setMarketingTerminal({ role: "manager" }, "dev-12345678", false);
    expect((await db.getSettings()).marketingDevices).toEqual([]);
  });
});

describe("marketing offline", () => {
  it("keeps brand and settings changes made offline and uploads them in order when back online", async () => {
    online = false;
    expect(await actions.saveBranding("r1", { tagline: "Old" })).toBeNull();
    expect(await actions.saveBranding("r1", { tagline: "New" })).toBeNull();
    expect(await actions.saveMarketingSettings("r1", { cooldownDays: 5 })).toBeNull();
    expect((await actions.readOutbox()).map((o) => o.kind)).toEqual(["branding", "settings"]);
    expect(calls).toHaveLength(0);
    online = true;
    expect(await actions.flushMarketingOutbox()).toEqual({ uploaded: 2, refused: 0 });
    expect(calls.map((c) => [c.table, c.op])).toEqual([["restaurants", "update"], ["restaurants", "update"]]);
    expect((calls[0]?.row as { branding: { tagline: string } }).branding.tagline).toBe("New");
    expect(await actions.readOutbox()).toEqual([]);
  });
  it("starts a manual campaign offline and uploads the campaign before its sends", async () => {
    online = false;
    const id = await actions.createCampaign("r1", { name: "Weekend", message: "Hi", audience: "all", mode: "manual", recipients: 2 });
    await actions.recordSend("r1", id, "919800000001", "Asha", "sent");
    expect(await actions.loadSentPhones(id)).toEqual(new Set(["919800000001"]));
    expect((await actions.loadCampaigns("r1")).map((c) => c.id)).toEqual([id]);
    await expect(actions.createCampaign("r1", { name: "Auto", message: "Hi", audience: "all", mode: "auto", recipients: 1 })).rejects.toThrow(/needs the internet/);
    online = true;
    await actions.flushMarketingOutbox();
    expect(calls.map((c) => c.table)).toEqual(["marketing_campaigns", "marketing_sends"]);
  });
  it("drops a change the cloud refuses instead of retrying it forever", async () => {
    online = false;
    await actions.saveBranding("r1", { tagline: "X" });
    online = true; refuse = true;
    expect(await actions.flushMarketingOutbox()).toEqual({ uploaded: 0, refused: 1 });
    expect(await actions.readOutbox()).toEqual([]);
  });
});
