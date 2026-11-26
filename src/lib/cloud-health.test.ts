import { describe, expect, it } from "vitest";
import { cloudReachable } from "./cloud-health";

describe("cloud reachable", () => {
  it("is true when the cloud answers", async () => {
    let asked = "";
    const ok = await cloudReachable("https://x.supabase.co/", "k", async (u) => { asked = u; return new Response("{}", { status: 200 }); });
    expect(ok).toBe(true);
    expect(asked).toBe("https://x.supabase.co/auth/v1/health");
  });
  it("is false with no internet or a server error", async () => {
    expect(await cloudReachable("https://x", "k", async () => { throw new TypeError("Failed to fetch"); })).toBe(false);
    expect(await cloudReachable("https://x", "k", async () => new Response("", { status: 503 }))).toBe(false);
    expect(await cloudReachable(undefined, "k")).toBe(false);
  });
  it("gives up when the cloud doesn't answer in time", async () => {
    const hang = (_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await cloudReachable("https://x", "k", hang, 20)).toBe(false);
  });
});
