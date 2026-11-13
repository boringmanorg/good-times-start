import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Small building blocks shared by the console tabs. */

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: "good" | "warn" | "bad" | undefined }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[24px] font-bold leading-tight tabular-nums [overflow-wrap:anywhere]", tone === "good" && "text-success", tone === "warn" && "text-warning", tone === "bad" && "text-destructive")}>{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading {what}…</p>;
}

export function Failed({ error }: { error: unknown }) {
  return <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">{error instanceof Error ? error.message : "Couldn't load this. Check the internet."}</p>;
}

export function Bars({ data, label }: { data: { key: string; n: number; tip: string }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div role="img" aria-label={label} className="flex h-36 items-end gap-[3px]">
      {data.map((d) => (
        <div key={d.key} title={d.tip} className="flex-1 rounded-t bg-primary/85 transition-opacity hover:opacity-70" style={{ height: `${Math.max(2, (100 * d.n) / max)}%` }} />
      ))}
    </div>
  );
}

export const field = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
