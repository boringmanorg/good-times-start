import { businessDayKey, DAY_OPENS_HOUR } from "./business-day";

/*
 * The opening word on POS Billdesk: one Bible verse a day (King James Version, public
 * domain), shown once per device at the first opening of each business day (from 6 am).
 */

export type DailyWord = {
  text: string;
  source: string;
  book: "Bible";
  translation: string;
};

const KJV = "King James Version";

export const BIBLE_WORDS: DailyWord[] = [
  { text: "And whatsoever ye do, do it heartily, as to the Lord, and not unto men;", source: "Colossians 3:23", book: "Bible", translation: KJV },
  { text: "Be not forgetful to entertain strangers: for thereby some have entertained angels unawares.", source: "Hebrews 13:2", book: "Bible", translation: KJV },
  { text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", source: "Galatians 6:9", book: "Bible", translation: KJV },
  { text: "This is the day which the LORD hath made; we will rejoice and be glad in it.", source: "Psalm 118:24", book: "Bible", translation: KJV },
  { text: "Commit thy works unto the LORD, and thy thoughts shall be established.", source: "Proverbs 16:3", book: "Bible", translation: KJV },
  { text: "A soft answer turneth away wrath: but grievous words stir up anger.", source: "Proverbs 15:1", book: "Bible", translation: KJV },
  { text: "Whatsoever thy hand findeth to do, do it with thy might;", source: "Ecclesiastes 9:10", book: "Bible", translation: KJV },
  { text: "I can do all things through Christ which strengtheneth me.", source: "Philippians 4:13", book: "Bible", translation: KJV },
  { text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding.", source: "Proverbs 3:5", book: "Bible", translation: KJV },
  { text: "Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", source: "Joshua 1:9", book: "Bible", translation: KJV },
  { text: "His compassions fail not. They are new every morning: great is thy faithfulness.", source: "Lamentations 3:22–23", book: "Bible", translation: KJV },
  { text: "By love serve one another.", source: "Galatians 5:13", book: "Bible", translation: KJV },
  { text: "And let the beauty of the LORD our God be upon us: and establish thou the work of our hands upon us.", source: "Psalm 90:17", book: "Bible", translation: KJV },
];

export const DAILY_WORD_KEY = "xtsy-daily-word";

/** Days since 1 Jan 1970 for a business-day key like "2026-11-26". */
function dayNumber(key: string): number {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** The verse for the business day that `at` falls in, going through the list a day at a time. */
export function wordFor(at: number): DailyWord {
  const n = dayNumber(businessDayKey(at));
  return BIBLE_WORDS[n % BIBLE_WORDS.length] ?? BIBLE_WORDS[0]!;
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
