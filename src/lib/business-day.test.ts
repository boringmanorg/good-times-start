import { describe, expect, it } from "vitest";
import { businessDateLabel, businessDayBounds, businessDayKey, businessDayStart, businessMonthStart, nextBusinessDay } from "./business-day";

const at = (s: string) => new Date(s).getTime();

describe("business day: 6 am to 6 am", () => {
  it("counts a bill settled at 12:02 am as the previous day's sale (POS/0112, POS/0131 on 26 Nov)", () => {
    expect(businessDayKey(at("2026-11-26T00:02:00"))).toBe("2026-11-25");
    expect(businessDayKey(at("2026-11-27T02:59:00"))).toBe("2026-11-26"); // late extension to 3 am
    expect(businessDayKey(at("2026-11-26T06:00:00"))).toBe("2026-11-26"); // opens at 6 am
    expect(businessDayKey(at("2026-11-26T11:27:00"))).toBe("2026-11-26");
  });
  it("bounds a business date from 6 am to the next 6 am", () => {
    const [from, to] = businessDayBounds("2026-11-25");
    expect(new Date(from).toString()).toBe(new Date("2026-11-25T06:00:00").toString());
    expect(to).toBe(at("2026-11-26T06:00:00"));
    expect(at("2026-11-26T00:02:00")).toBeGreaterThanOrEqual(from);
    expect(at("2026-11-26T00:02:00")).toBeLessThan(to);
  });
  it("knows which day it is before the opening", () => {
    expect(businessDateLabel(0, at("2026-11-26T01:30:00"))).toBe("2026-11-25");
    expect(businessDateLabel(0, at("2026-11-26T09:00:00"))).toBe("2026-11-26");
    expect(businessDateLabel(-1, at("2026-11-26T09:00:00"))).toBe("2026-11-25");
    expect(businessDateLabel(-1, at("2026-12-01T03:00:00"))).toBe("2026-11-29");
  });
  it("moves day by day and month by month across month ends", () => {
    expect(nextBusinessDay(businessDayStart(at("2026-11-30T23:00:00")))).toBe(at("2026-12-01T06:00:00"));
    expect(businessMonthStart(at("2026-12-01T02:00:00"))).toBe(at("2026-11-01T06:00:00")); // still 30 Nov's day
    expect(businessMonthStart(at("2026-12-01T07:00:00"))).toBe(at("2026-12-01T06:00:00"));
  });
});
