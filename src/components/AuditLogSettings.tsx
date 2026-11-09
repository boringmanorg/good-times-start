import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStaff } from "@/lib/auth-context";
import { can } from "@/lib/permissions";
import { loadTerminals } from "@/lib/terminal-actions";
import { AUDIT_KINDS, AUDIT_PAGE, changeLines, kindLabel, loadAuditLog, type AuditEntry } from "@/lib/audit-log";
import { cn } from "@/lib/utils";

const ACTION_STYLE: Record<AuditEntry["action"], string> = {
  created: "bg-success/10 text-success", changed: "bg-primary/10 text-primary", deleted: "bg-destructive/10 text-destructive", restored: "bg-warning/15 text-warning",
};
const ACTION_TEXT: Record<AuditEntry["action"], string> = { created: "Added", changed: "Changed", deleted: "Deleted", restored: "Restored" };

function dayInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Admin-only: every change across the restaurant, filterable by day, terminal and type. */
export function AuditLogSettings() {
  const { user } = useStaff();
  const restaurantId = user?.restaurantId ?? "";
  const allowed = !!restaurantId && can(user, "terminals.manage");
  const [day, setDay] = useState(() => dayInput(new Date()));
  const [device, setDevice] = useState("");
  const [kind, setKind] = useState("");
  const range = useMemo(() => { const from = new Date(`${day}T00:00:00`); return { from, to: new Date(from.getTime() + 86_400_000) }; }, [day]);
  const terminals = useQuery({ queryKey: ["terminals", restaurantId], queryFn: () => loadTerminals(restaurantId), enabled: allowed, staleTime: 60_000 });
  const deviceName = (id: string | null) => {
    if (!id) return "Not recorded";
    const t = terminals.data?.find((x) => x.device_id === id);
    return t ? (t.description || t.series || "Terminal") + (t.series && t.description ? ` · ${t.series}` : "") : `Device ${id.slice(0, 8)}`;
  };
  const log = useInfiniteQuery({
    queryKey: ["audit-log", restaurantId, day, device, kind],
    queryFn: ({ pageParam }) => loadAuditLog(restaurantId, { ...range, ...(device ? { device } : {}), ...(kind ? { kind } : {}) }, pageParam || undefined),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length === AUDIT_PAGE ? last[last.length - 1]?.id : undefined),
    enabled: allowed,
  });
  if (!allowed) return <p className="text-sm text-muted-foreground">Only the owner or a manager can see the audit log.</p>;
  const rows = log.data?.pages.flat() ?? [];
  const select = "h-10 rounded-lg border border-input bg-card px-3 text-sm";
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-muted-foreground">Day<input type="date" value={day} max={dayInput(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} className={cn(select, "mt-1 block")} /></label>
      <label className="text-xs font-medium text-muted-foreground">Terminal<select value={device} onChange={(e) => setDevice(e.target.value)} className={cn(select, "mt-1 block min-w-44")}>
        <option value="">All terminals</option>
        {(terminals.data ?? []).map((t) => <option key={t.device_id} value={t.device_id}>{deviceName(t.device_id)}</option>)}
        <option value="none">Not recorded</option>
      </select></label>
      <label className="text-xs font-medium text-muted-foreground">Type<select value={kind} onChange={(e) => setKind(e.target.value)} className={cn(select, "mt-1 block min-w-40")}>
        <option value="">Everything</option>{AUDIT_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
      </select></label>
      <Button variant="outline" onClick={() => void log.refetch()} disabled={log.isFetching}><RefreshCw className={cn(log.isFetching && "animate-spin")} />Refresh</Button>
    </div>
    {log.error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{log.error.message}</p> : null}
    <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map((e) => {
        const lines = changeLines(e);
        return <li key={e.id} className="grid gap-1 p-4 sm:grid-cols-[6rem_1fr]">
          <time className="text-sm font-semibold tabular-nums text-muted-foreground" dateTime={e.at}>{new Date(e.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", ACTION_STYLE[e.action])}>{ACTION_TEXT[e.action]}</span>
              <span className="font-semibold">{kindLabel(e.kind)}</span><span className="break-all">{e.label ?? e.record_id}</span>
            </p>
            {lines.length ? <ul className="mt-1.5 space-y-0.5 text-sm">{lines.slice(0, 12).map((l, i) => <li key={i} className="break-words">{l}</li>)}{lines.length > 12 ? <li className="text-muted-foreground">+{lines.length - 12} more changes</li> : null}</ul> : null}
            <p className="mt-1.5 text-xs text-muted-foreground">{deviceName(e.device_id)} · {e.user_email ?? (e.user_id ? "Signed-in staff" : "System")}</p>
          </div>
        </li>;
      })}
      {!rows.length && !log.isLoading ? <li className="p-8 text-center text-sm text-muted-foreground">No changes recorded on this day{device || kind ? " for this filter" : ""}.</li> : null}
      {log.isLoading ? <li className="p-8 text-center text-sm text-muted-foreground">Loading…</li> : null}
    </ol>
    {log.hasNextPage ? <Button variant="outline" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>{log.isFetchingNextPage ? "Loading…" : "Load older changes"}</Button> : null}
  </div>;
}
