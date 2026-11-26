import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One recorded demo (public/videos/<id>.mp4, poster <id>.jpg). Muted, looping and silent, it
 * plays only while on screen and loads nothing until it gets close. Visitors who ask for reduced
 * motion see the poster and start it themselves. The play/pause button is always there.
 */
export function DemoVideo({ id, title, phone = false, className, eager = false }: { id: string; title: string; phone?: boolean; className?: string; eager?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    setStill(reduce);
    if (reduce || userPaused) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e) return;
      if (e.isIntersecting) { v.preload = "auto"; void v.play().catch(() => {}); } else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, [id, userPaused]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { setUserPaused(false); v.preload = "auto"; void v.play().catch(() => {}); }
    else { setUserPaused(true); v.pause(); }
  };

  return (
    <figure className={cn("relative overflow-hidden bg-black", phone ? "rounded-[2.2rem] border-[6px] border-[#2a2a2e] shadow-[0_30px_80px_-30px_rgba(233,185,73,0.35)]" : "rounded-xl border border-white/10 shadow-[0_40px_120px_-40px_rgba(233,185,73,0.35)]", className)}>
      <video
        key={id}
        ref={ref}
        className="block h-auto w-full"
        src={`/videos/${id}.mp4`}
        poster={`/videos/${id}.jpg`}
        muted
        loop
        playsInline
        preload={eager ? "metadata" : "none"}
        width={phone ? 720 : 1600}
        height={phone ? 1558 : 1000}
        aria-label={`Demo video: ${title}`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button type="button" onClick={toggle}
        className={cn("absolute bottom-3 left-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/75 px-3.5 text-sm font-semibold text-white backdrop-blur hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
          still && !playing && "bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2 bg-primary px-5 text-primary-foreground hover:bg-primary-hover")}
        aria-label={playing ? `Pause: ${title}` : `Play: ${title}`}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}{playing ? "Pause" : "Play"}
      </button>
    </figure>
  );
}
