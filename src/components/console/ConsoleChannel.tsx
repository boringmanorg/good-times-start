import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { consoleToken } from "@/lib/console-client";
import { platformChannelStatus } from "@/lib/pms-channel.functions";
import { cn } from "@/lib/utils";
import { Failed, Loading } from "./ConsoleBits";

/**
 * Console → stay property → Channel manager. Reads, never writes: whether the server holds a
 * well-formed ZimmerStack key, test or live, and which hotels it reaches. The key never leaves
 * the server; only its check message comes back.
 */
export function ConsoleChannel({ name }: { name: string }) {
  const status = useQuery({ queryKey: ["console", "channel"], queryFn: async () => platformChannelStatus({ data: { token: await consoleToken() } }), staleTime: 60_000 });
  if (status.isLoading) return <Loading what="the channel manager" />;
  if (status.error || !status.data) return <Failed error={status.error} />;
  const s = status.data;
  return (
    <div className="space-y-4">
      <div className={cn("flex items-start gap-3 rounded-xl border p-4", s.keyOk && !s.error ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10")}>
        {s.keyOk && !s.error ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />}
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">ZimmerStack key {s.keyOk ? (s.mode === "test" ? "· sandbox (test)" : "· live") : "· not ready"}{s.keyKind ? ` · ${s.keyKind === "company" ? "company key" : "one hotel's key"}` : ""}</p>
          <p className="text-muted-foreground">{s.error ? `${s.error.message} (${s.error.code})` : s.keyMessage}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void status.refetch()} disabled={status.isFetching}><RefreshCw className="size-4" />Check again</Button>
      </div>
      {s.hotels ? (
        <section className="rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">Hotels this key reaches · {s.hotels.length}</p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {s.hotels.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{h.name} <span className="text-xs text-muted-foreground">#{h.id}</span></span>
                <span className="text-xs text-muted-foreground">{h.sandbox ? "Sandbox" : "Real hotel"} · {h.channelManager ? "publishing to booking sites" : "not publishing yet"}</span>
              </li>
            ))}
            {!s.hotels.length ? <li className="py-2 text-muted-foreground">No hotels yet.</li> : null}
          </ul>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">
        The PMS becomes the one system that sends {name}'s room counts and prices to ZimmerStack. Nothing is sent from here yet:
        linking this property to its hotel, sending rooms and prices, and receiving OTA bookings come next, each started by a person.
      </p>
    </div>
  );
}
