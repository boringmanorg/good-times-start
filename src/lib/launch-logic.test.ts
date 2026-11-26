import { describe, expect, it } from "vitest";
import { launchElapsed, shouldPlayLaunch } from "./launch-logic";

describe("launch splash", () => {
  it("plays once per window", () => {
    expect(shouldPlayLaunch(null)).toBe(true);
    expect(shouldPlayLaunch("1764100000000")).toBe(false);
  });
  it("carries on from where the loading screen left it", () => {
    expect(launchElapsed(1000, 1000)).toBe(0);
    expect(launchElapsed(1000, 2200)).toBe(1200);
    expect(launchElapsed(1000, 1000 + 3200)).toBeNull();
    expect(launchElapsed(-Infinity, 5000)).toBeNull();
  });
});
