import { describe, expect, it } from "vitest";
import { addChannelTokens, hexToChannels, legacyColorFallback, translucentFallbacks } from "./legacy-colors";

describe("translucent colours on Chrome 109 (Windows 7 counters)", () => {
  it("hex to channels", () => {
    expect(hexToChannels("#ff8a00")).toBe("255 138 0");
    expect(hexToChannels("#fff")).toBe("255 255 255");
    expect(hexToChannels("var(--x)")).toBeNull();
  });
  it("adds an -rgb token beside each hex token, per theme", () => {
    expect(addChannelTokens(":root,.dark{--gold:#ff8a00;--radius:.75rem}.theme-xtsy{--gold:#b5452f}"))
      .toBe(":root,.dark{--gold:#ff8a00;--gold-rgb:255 138 0;--radius:.75rem}.theme-xtsy{--gold:#b5452f;--gold-rgb:181 69 47}");
  });
  it("turns the solid fallback into a 15% tint, and keeps the color-mix rule for new browsers", () => {
    const tw = ".bg-gold\\/15{background-color:var(--gold)}@supports (color:color-mix(in lab, red, red)){.bg-gold\\/15{background-color:color-mix(in oklab, var(--gold) 15%, transparent)}}";
    expect(translucentFallbacks(tw)).toBe(".bg-gold\\/15{background-color:rgb(var(--gold-rgb) / 15%)}@supports (color:color-mix(in lab, red, red)){.bg-gold\\/15{background-color:color-mix(in oklab, var(--gold) 15%, transparent)}}");
  });
  it("handles Tailwind's --color-* names and leaves unpaired rules alone", () => {
    expect(legacyColorFallback(":root{--color-black:#000;--gold:#ff8a00}.a{color:var(--color-black)}@supports (color:color-mix(in lab, red, red)){.a{color:color-mix(in oklab, var(--color-black) 40%, transparent)}}.b{color:var(--color-gold)}@supports (color:color-mix(in lab, red, red)){.b{color:color-mix(in oklab, var(--color-gold) 40%, transparent)}}"))
      .toContain(".a{color:rgb(var(--color-black-rgb) / 40%)}");
    expect(legacyColorFallback(":root{--gold:#ff8a00}.b{color:var(--color-gold)}@supports (color:color-mix(in lab, red, red)){.b{color:color-mix(in oklab, var(--color-gold) 40%, transparent)}}"))
      .toContain(".b{color:rgb(var(--gold-rgb) / 40%)}");
    const other = ".a{color:var(--x)}@supports (color:color-mix(in lab, red, red)){.b{color:color-mix(in oklab, var(--x) 40%, transparent)}}";
    expect(translucentFallbacks(other)).toBe(other);
  });
  it("splits a fallback Tailwind shares between the solid and the tinted class", () => {
    const shared = ":root{--destructive:#ff453a}.bg-destructive,.bg-destructive\\/5{background-color:var(--destructive)}@supports (color:color-mix(in lab, red, red)){.bg-destructive\\/5{background-color:color-mix(in oklab, var(--destructive) 5%, transparent)}}";
    expect(legacyColorFallback(shared)).toContain(".bg-destructive{background-color:var(--destructive)}.bg-destructive\\/5{background-color:rgb(var(--destructive-rgb) / 5%)}@supports");
  });
  it("does nothing to CSS without color-mix", () => {
    expect(legacyColorFallback(".a{color:red}")).toBe(".a{color:red}");
  });
});
