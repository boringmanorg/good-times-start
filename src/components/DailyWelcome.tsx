import { useEffect, useState } from "react";
import { useStaff } from "@/lib/staff";
import { useAppMode } from "@/lib/app-mode";
import { businessDayKey } from "@/lib/business-day";
import { DAILY_WORD_KEY, greetingFor, shouldShowWord, wordFor, type DailyWord } from "@/lib/daily-word";
import { XtsyMark } from "./LaunchSplash";

/**
 * The opening word on POS Billdesk: the first time the counter opens each business day
 * (from 6 am), a short Bible verse before the shift starts.
 * Sits just under the launch splash, so it's there when the splash fades.
 */
export function DailyWelcome() {
  const { user } = useStaff();
  const app = useAppMode(user);
  const [word, setWord] = useState<DailyWord | null>(null);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    if (app !== "pos" || !user) return;
    let last: string | null = null;
    try { last = window.localStorage.getItem(DAILY_WORD_KEY); } catch { /* storage unavailable */ }
    if (!shouldShowWord(last, now)) return;
    setWord(wordFor(now));
  }, [app, user, now]);
  if (!word) return null;
  const close = () => {
    try { window.localStorage.setItem(DAILY_WORD_KEY, businessDayKey(now)); } catch { /* ignore */ }
    setWord(null);
  };
  const first = user?.displayName?.split(" ")[0];
  const date = new Date(now).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dw-title"
      className="dw-in fixed inset-0 z-[190] grid place-items-center overflow-y-auto bg-black/95 p-5 text-white">
      <div className="w-full max-w-xl rounded-[28px] border border-[#e9b949]/60 bg-black px-6 py-9 text-center shadow-[0_0_80px_rgba(233,185,73,.12)] sm:px-10">
        <XtsyMark size={64} />
        <p className="mt-5 text-sm text-[#c4c4ca]">{date}</p>
        <h2 id="dw-title" className="mt-1 font-brand text-4xl tracking-[0.04em] sm:text-5xl">
          {greetingFor(now)}{first ? `, ${first}` : ""}
        </h2>
        <p className="mt-2 text-[15px] text-[#c4c4ca]">A word to start the day</p>
        <blockquote className="mx-auto mt-7 max-w-[34ch] text-balance text-[1.35rem] leading-relaxed text-white sm:text-2xl">
          “{word.text}”
        </blockquote>
        <p className="mt-5 font-semibold text-[#e9b949]">{word.source}</p>
        <p className="mt-1 text-xs text-[#c4c4ca]">{word.book} · {word.translation}</p>
        <p className="mx-auto mt-7 max-w-[38ch] text-[15px] text-[#c4c4ca]">
          Every guest today is welcomed by you. Thank you for opening up.
        </p>
        <button type="button" autoFocus onClick={close}
          className="mt-7 inline-flex h-12 items-center rounded-full bg-[#e9b949] px-8 text-base font-bold text-black outline-none ring-offset-2 ring-offset-black focus-visible:ring-2 focus-visible:ring-[#e9b949]">
          Start the day
        </button>
      </div>
    </div>
  );
}
