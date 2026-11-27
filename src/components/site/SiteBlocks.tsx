import { Check } from "lucide-react";
import { STATUS } from "@/lib/site-content";
import { cn } from "@/lib/utils";

/** Where every model stands today. Only what has shipped is under Live. */
export function StatusBoard() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr]">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-extrabold"><span className="size-2.5 rounded-full bg-[#2F4A3F]" aria-hidden="true" />Live now</h3>
        <ul className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          {STATUS.live.map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#2F4A3F]" />{t}</li>)}
        </ul>
      </div>
      <StatusList title="Being tested" dot="bg-[#C98A1B]" items={STATUS.testing} />
      <StatusList title="Coming next" dot="bg-primary" items={STATUS.next} />
    </div>
  );
}

function StatusList({ title, dot, items }: { title: string; dot: string; items: { name: string; note: string }[] }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-lg font-extrabold"><span className={cn("size-2.5 rounded-full", dot)} aria-hidden="true" />{title}</h3>
      <ul className="mt-4 space-y-4">
        {items.map((t) => <li key={t.name} className="border-l-2 border-[#1F2230]/20 pl-3"><p className="text-sm font-bold">{t.name}</p><p className="mt-0.5 text-sm text-muted-foreground">{t.note}</p></li>)}
      </ul>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="max-w-3xl divide-y divide-[#1F2230]/10 border-y border-[#1F2230]/10">
      {items.map((f) => (
        <details key={f.q} className="group py-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold"><h3 className="text-base">{f.q}</h3><span className="text-2xl leading-none text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span></summary>
          <p className="mt-2 max-w-[65ch] text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
