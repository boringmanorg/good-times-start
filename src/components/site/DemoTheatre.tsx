import { useState } from "react";
import { DEMOS } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { DemoVideo } from "./DemoVideo";

/** The recorded Restaurant POS demos: pick one on the left (a row of chips on phones), watch it on the right. */
export function DemoTheatre({ start = DEMOS[0]!.id }: { start?: string }) {
  const [active, setActive] = useState(start);
  const demo = DEMOS.find((d) => d.id === active) ?? DEMOS[0]!;
  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_1fr] lg:gap-10">
      <div role="group" aria-label="Choose a demo" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
        {DEMOS.map((d) => {
          const on = d.id === active;
          return (
            <button key={d.id} type="button" aria-pressed={on} onClick={() => setActive(d.id)}
              className={cn("shrink-0 rounded-full border px-4 py-2 text-left text-sm font-bold lg:block lg:w-full lg:rounded-none lg:border-0 lg:border-l-2 lg:px-4 lg:py-3",
                on ? "border-primary bg-primary text-primary-foreground lg:bg-white lg:text-foreground" : "border-[#1F2230]/15 text-muted-foreground hover:text-foreground lg:border-[#1F2230]/10")}>
              <span className="block">{d.title}</span>
              <span className={cn("hidden text-xs font-semibold lg:block", on ? "text-primary" : "text-muted-foreground")}>{d.app}</span>
              {on ? <span className="mt-2 hidden text-sm font-normal leading-relaxed text-muted-foreground lg:block">{d.text}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="rounded-3xl bg-[#1F2230] p-3 sm:p-6">
        <div className={cn(demo.device === "phone" && "mx-auto max-w-[300px]")}>
          <DemoVideo key={demo.id} id={demo.id} title={demo.title} phone={demo.device === "phone"} />
        </div>
        <p className="mt-4 text-sm text-[#FAF7F2]/75 lg:hidden"><span className="font-bold text-[#FAF7F2]">{demo.app}.</span> {demo.text}</p>
      </div>
    </div>
  );
}
