import { describe, expect, it } from "vitest";
import { BIBLE_WORDS, greetingFor, shouldShowWord, wordFor } from "./daily-word";

const at = (d: string, h: number, m = 0) => { const [y = 0, mo = 1, da = 1] = d.split("-").map(Number); return new Date(y, mo - 1, da, h, m).getTime(); };

describe("daily word", () => {
  it("uses only Bible verses and changes every day", () => {
    const words = ["2026-11-24", "2026-11-25", "2026-11-26"].map((d) => wordFor(at(d, 9)));
    expect(words.every((w) => w.book === "Bible")).toBe(true);
    expect(words[0]!.source).not.toBe(words[1]!.source);
    expect(words[1]!.source).not.toBe(words[2]!.source);
  });

  it("keeps the same verse for the whole business day, including after midnight", () => {
    expect(wordFor(at("2026-11-25", 7))).toEqual(wordFor(at("2026-11-26", 2)));
    expect(wordFor(at("2026-11-25", 23))).not.toEqual(wordFor(at("2026-11-26", 7)));
  });

  it("goes through every verse", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(wordFor(at("2026-11-01", 9) + i * 86_400_000).source);
    expect(seen.size).toBe(BIBLE_WORDS.length);
  });

  it("shows once per business day, only from 6 am", () => {
    expect(shouldShowWord(null, at("2026-11-26", 5, 59))).toBe(false);
    expect(shouldShowWord(null, at("2026-11-26", 6))).toBe(true);
    expect(shouldShowWord("2026-11-26", at("2026-11-26", 14))).toBe(false);
    expect(shouldShowWord("2026-11-25", at("2026-11-26", 6, 30))).toBe(true);
    // A late close at 1 am belongs to the night before: no new verse.
    expect(shouldShowWord("2026-11-25", at("2026-11-26", 1))).toBe(false);
  });

  it("greets by the clock", () => {
    expect(greetingFor(at("2026-11-26", 7))).toBe("Good morning");
    expect(greetingFor(at("2026-11-26", 13))).toBe("Good afternoon");
    expect(greetingFor(at("2026-11-26", 19))).toBe("Good evening");
  });
});
