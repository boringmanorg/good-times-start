import { describe, expect, it } from "vitest";
import { checkAdminCode, codeForStep, currentAdminCode, isAdminCodeKey, newAdminCodeKey, stepAt } from "./admin-code";

const key = { secret: "3132333435363738393031323334353637383930", createdAt: 0 }; // RFC 6238 test key "1234567890…"

describe("admin code", () => {
  it("gives 6 digits that change every 60 seconds and repeat for the same minute", async () => {
    const a = await currentAdminCode(key.secret, 1_700_000_000_000);
    const b = await currentAdminCode(key.secret, 1_700_000_000_000 + 20_000);
    const c = await currentAdminCode(key.secret, 1_700_000_060_000);
    expect(a.code).toMatch(/^\d{6}$/);
    expect(stepAt(1_700_000_000_000) === stepAt(1_700_000_020_000) ? a.code === b.code : true).toBe(true);
    expect(c.code).not.toBe((await currentAdminCode(key.secret, 1_700_000_000_000 - 60_000)).code);
    expect(a.secondsLeft).toBeGreaterThan(0);
    expect(a.secondsLeft).toBeLessThanOrEqual(60);
  });
  it("matches an independent HMAC-SHA256 one-time-code calculation", async () => {
    const { createHmac } = await import("node:crypto");
    const reference = (step: number) => {
      const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
      const mac = createHmac("sha256", Buffer.from(key.secret, "hex")).update(counter).digest();
      const o = mac[mac.length - 1]! & 0x0f;
      return String(((mac.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
    };
    for (const step of [0, 1, 59, 28_333_333, 2 ** 40]) expect(await codeForStep(key.secret, step)).toBe(reference(step));
  });
  it("accepts the current code and one step either side, once per terminal", async () => {
    const now = 1_700_000_030_000;
    const step = stepAt(now);
    const code = await codeForStep(key.secret, step);
    expect(await checkAdminCode(code, key, now)).toBe(step);
    expect(await checkAdminCode(code, key, now + 60_000)).toBe(step);
    expect(await checkAdminCode(code, key, now + 180_000)).toBeNull();
    expect(await checkAdminCode(code, key, now, step)).toBeNull();
    expect(await checkAdminCode("12345", key, now)).toBeNull();
    expect(await checkAdminCode(code, null, now)).toBeNull();
  });
  it("a new key stops older codes", async () => {
    const now = 1_700_000_030_000;
    const fresh = newAdminCodeKey(now);
    expect(isAdminCodeKey(fresh)).toBe(true);
    expect(await checkAdminCode(await codeForStep(key.secret, stepAt(now)), fresh, now)).toBeNull();
    expect(await checkAdminCode(await codeForStep(fresh.secret, stepAt(now) - 1), fresh, now)).toBeNull();
  });
});
