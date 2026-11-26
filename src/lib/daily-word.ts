import { businessDayKey, DAY_OPENS_HOUR } from "./business-day";

/*
 * The opening word on POS Billdesk: one verse a day, the Bible and the Quran taking turns,
 * shown once per device at the first opening of each business day (from 6 am).
 * Texts are public-domain translations: King James Version (Bible) and
 * Marmaduke Pickthall, 1930 (Quran).
 */

export type DailyWord = {
  text: string;
  source: string;
  book: "Bible" | "Quran";
  translation: string;
};

const KJV = "King James Version";
const PICKTHALL = "Pickthall translation";

export const BIBLE_WORDS: DailyWord[] = [
  { text: "And whatsoever ye do, do it heartily, as to the Lord, and not unto men;", source: "Colossians 3:23", book: "Bible", translation: KJV },
  { text: "Be not forgetful to entertain strangers: for thereby some have entertained angels unawares.", source: "Hebrews 13:2", book: "Bible", translation: KJV },
  { text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", source: "Galatians 6:9", book: "Bible", translation: KJV },
  { text: "This is the day which the LORD hath made; we will rejoice and be glad in it.", source: "Psalm 118:24", book: "Bible", translation: KJV },
  { text: "Commit thy works unto the LORD, and thy thoughts shall be established.", source: "Proverbs 16:3", book: "Bible", translation: KJV },
  { text: "A soft answer turneth away wrath: but grievous words stir up anger.", source: "Proverbs 15:1", book: "Bible", translation: KJV },
  { text: "Whatsoever thy hand findeth to do, do it with thy might;", source: "Ecclesiastes 9:10", book: "Bible", translation: KJV },
];

export const QURAN_WORDS: DailyWord[] = [
  { text: "But lo! with hardship goeth ease, lo! with hardship goeth ease;", source: "Quran 94:5–6", book: "Quran", translation: PICKTHALL },
  { text: "O ye who believe! Seek help in steadfastness and prayer. Lo! Allah is with the steadfast.", source: "Quran 2:153", book: "Quran", translation: PICKTHALL },
  { text: "Allah tasketh not a soul beyond its scope.", source: "Quran 2:286", book: "Quran", translation: PICKTHALL },
  { text: "Is the reward of goodness aught save goodness?", source: "Quran 55:60", book: "Quran", translation: PICKTHALL },
  { text: "And whosoever putteth his trust in Allah, He will suffice him.", source: "Quran 65:3", book: "Quran", translation: PICKTHALL },
  { text: "Spend your wealth for the cause of Allah, and be not cast by your own hands to ruin; and do good. Lo! Allah loveth the beneficent.", source: "Quran 2:195", book: "Quran", translation: PICKTHALL },
];

export const DAILY_WORD_KEY = "xtsy-daily-word";

/** Days since 1 Jan 1970 for a business-day key like "2026-11-26". */
function dayNumber(key: string): number {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** The verse for the business day that `at` falls in: even days Bible, odd days Quran. */
export function wordFor(at: number): DailyWord {
  const n = dayNumber(businessDayKey(at));
  const half = Math.floor(n / 2);
  const list = n % 2 === 0 ? BIBLE_WORDS : QURAN_WORDS;
  return list[half % list.length] ?? BIBLE_WORDS[0]!;
}

/**
 * Show it now? Only from 6 am until midnight (a late close after midnight belongs to the
 * night before and gets no new verse), and only if this device hasn't shown today's yet.
 */
export function shouldShowWord(lastShownKey: string | null, at: number): boolean {
  if (new Date(at).getHours() < DAY_OPENS_HOUR) return false;
  return lastShownKey !== businessDayKey(at);
}

/** Greeting by the clock. */
export function greetingFor(at: number): string {
  const h = new Date(at).getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
