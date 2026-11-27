import { useEffect, useState } from "react";
import logo from "@/assets/logo.png";
import { LAUNCH_KEY, LAUNCH_MS, launchElapsed, shouldPlayLaunch } from "@/lib/launch-logic";

// When this window's launch began; the loading screen's copy and the app's copy share it.
let startedAt: number | null = null;

/**
 * The XTSY launch: the logo settles in while a gold ring draws around it, "XTSY POS" rises,
 * then "POS by XTSY" on a gold rule. Plays once per app launch (a reload in the same window
 * doesn't replay it), about 3.4 seconds, and any tap or key skips it so it never holds up a
 * bill. With reduced motion it shows still and leaves after a moment.
 */
export function LaunchSplash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (startedAt === null) {
      let seen: string | null = null;
      try { seen = window.sessionStorage.getItem(LAUNCH_KEY); } catch { /* storage unavailable */ }
      if (!shouldPlayLaunch(seen)) return;
      startedAt = Date.now();
      try { window.sessionStorage.setItem(LAUNCH_KEY, String(startedAt)); } catch { /* ignore */ }
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const total = reduce ? 1200 : LAUNCH_MS;
    const elapsed = launchElapsed(startedAt, Date.now(), total);
    if (elapsed === null) return;
    setOffset(elapsed);
    setShow(true);
    const t1 = window.setTimeout(() => setLeaving(true), total - 400 - elapsed);
    const t2 = window.setTimeout(() => { setShow(false); startedAt = -Infinity; }, total - elapsed);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);
  useEffect(() => {
    if (!show) return;
    const skip = () => { startedAt = -Infinity; setLeaving(true); window.setTimeout(() => setShow(false), 250); };
    window.addEventListener("keydown", skip, { once: true });
    return () => window.removeEventListener("keydown", skip);
  }, [show]);
  if (!show) return null;
  return (
    <div role="presentation" onPointerDown={() => { startedAt = -Infinity; setLeaving(true); window.setTimeout(() => setShow(false), 250); }}
      style={{ ["--xl-t" as string]: `${offset}ms` }}
      className={`xl-splash fixed inset-0 z-[200] grid place-items-center bg-[#1f2230] text-[#faf7f2] ${leaving ? "xl-leave" : ""}`}>
      <div className="flex flex-col items-center">
        <XtsyMark size={132} />
        <p className="xl-word mt-7 overflow-hidden font-brand text-[3.4rem] leading-none tracking-[0.06em] sm:text-7xl"><span>XTSY POS</span></p>
        <div className="xl-rule mt-4 h-px w-48 bg-[#e8b4c0]" aria-hidden="true" />
        <p className="xl-by mt-3 text-sm font-bold uppercase tracking-[0.42em] text-[#e8b4c0]">POS by XTSY</p>
      </div>
      <span className="sr-only">XTSY POS is opening</span>
    </div>
  );
}

/** The XTSY logo inside a gold ring that draws itself. `loop` keeps it breathing, for loading screens. */
export function XtsyMark({ size = 72, loop = false }: { size?: number; loop?: boolean }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <span className={`xl-mark relative inline-grid place-items-center ${loop ? "xl-loop" : ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(233,185,73,.16)" strokeWidth="1.5" />
        <circle className="xl-ring" cx="50" cy="50" r={r} fill="none" stroke="#e8b4c0" strokeWidth="2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c} style={{ ["--xl-c" as string]: String(c) }} />
      </svg>
      <img src={logo} alt="" width={size} height={size} className="xl-logo relative rounded-[22%]" style={{ width: size * 0.62, height: size * 0.62 }} />
    </span>
  );
}

/** Loading screen for the staff apps: the breathing mark and the product name. */
export function XtsyLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#1f2230]">
      <div className="flex flex-col items-center gap-4">
        <XtsyMark size={84} loop />
        <p className="text-xs font-bold uppercase tracking-[0.42em] text-[#e8b4c0]">POS by XTSY</p>
      </div>
    </div>
  );
}
