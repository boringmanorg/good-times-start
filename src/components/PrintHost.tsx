import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { usePrintConfig } from "@/lib/print-config";
import { printCss } from "@/lib/print-logic";
import { getDb } from "@/lib/db";
import type { Kot, Order } from "@/lib/types";
import { KOT_END_FEED_MM } from "@/lib/slip";
import { useAppMode } from '@/lib/app-mode';
import { useStaff } from '@/lib/staff';
import { supabase } from '@/integrations/supabase/client';
import { getDeviceId } from '@/lib/terminal-actions';
import { flushCounterPrints } from '@/lib/counter-print';
import { clearPrintJobs, hasPrintJobs, markKotsSeen, printBill, printJobsServerSnapshot, printJobsSnapshot, printKots, subscribePrintJobs } from "@/lib/print-jobs";

/**
 * Prints tickets that arrive from other billing devices while this app is open,
 * when "Print KOTs sent from other devices" is on. This used to live on the
 * Kitchen display; it now runs app-wide so station printers work without a
 * kitchen screen.
 */
export function IncomingKotWatcher() {
  const since = Date.now() - 12 * 60 * 60 * 1000;
  const kots = useLiveQuery(() => getDb().kots.where("createdAt").aboveOrEqual(since).toArray(), [Math.floor(since / 60000)], []);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const ids = new Set(kots.map((k) => k.uid ?? String(k.id)));
    if (seen.current) {
      const fresh = kots.filter((k) => k.status === "new" && !seen.current?.has(k.uid ?? String(k.id)));
      if (fresh.length) void printKots(fresh, "incoming");
    } else {
      markKotsSeen(kots);
    }
    seen.current = ids;
  }, [kots]);

  return null;
}

export function PrintHost() {
  const docs = useSyncExternalStore(subscribePrintJobs, printJobsSnapshot, printJobsServerSnapshot);
  const config = usePrintConfig();

  useEffect(() => {
    if (!docs.length) return;
    // Give QR codes and fonts a moment to render before the print dialog takes over.
    // The browser print dialog freezes this page, so send the just-saved bill/KOT to the
    // cloud first (bounded wait) — otherwise other terminals see the table amount only.
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rid = (await getDb().meta.get("restaurantId"))?.value;
          if (typeof rid === "string" && rid && navigator.onLine) {
            const { syncCloudData } = await import("@/lib/cloud-sync");
            await Promise.race([syncCloudData(rid).catch(() => undefined), new Promise((r) => setTimeout(r, 4000))]);
          }
        } catch { /* printing must never wait on sync errors */ }
        if (cancelled) return;
        try { window.print(); } catch { /* printing unavailable; bill is already saved */ }
      })();
    }, 450);
    const clear = clearPrintJobs;
    window.addEventListener("afterprint", clear, { once: true });
    return () => { cancelled = true; window.clearTimeout(timer); window.removeEventListener("afterprint", clear); };
  }, [docs]);

  return (
    <>
      <style>{`#print-root { position: fixed; left: -10000px; top: 0; width: 80mm; --kot-end-feed: ${KOT_END_FEED_MM}mm; }\n${printCss(config.paper)}`}</style>
      <div id="print-root" aria-hidden="true">
        {docs.map((d, i) => <div key={i} className="print-ticket">{d}</div>)}
      </div>
    </>
  );
}

/** Only the designated POS consumes explicit commands. Claimed jobs never replay automatically. */
export function CounterPrintWatcher() {
  const { user } = useStaff();
  const app = useAppMode(user);
  const config = usePrintConfig();
  useEffect(() => {
    const restaurant = user?.restaurantId;
    if (!restaurant || app === 'manager') return;
    let stopped = false;
    let busy = false;
    const run = async () => {
      if (busy || stopped || !navigator.onLine) return;
      busy = true;
      try {
        await flushCounterPrints(restaurant);
        if (app !== 'pos' || hasPrintJobs()) return;
        const device = await getDeviceId();
        const { data, error } = await supabase.rpc('claim_counter_print', { _restaurant: restaurant, _device: device });
        if (error || !data || stopped) return;
        const job = data as unknown as { id: string; kind: 'bill' | 'kot'; payload: Order | Kot[] };
        if (job.kind === 'kot' && Array.isArray(job.payload)) await printKots(job.payload, 'reprint');
        else if (job.kind === 'bill' && !Array.isArray(job.payload)) await printBill(job.payload);
        await supabase.rpc('finish_counter_print', { _id: job.id, _device: device });
      } catch { /* queue remains durable; dispatch is not physical print confirmation */ }
      finally { busy = false; }
    };
    void run();
    const timer = window.setInterval(() => void run(), 2500);
    window.addEventListener('online', run);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', run); };
  }, [user?.restaurantId, app, config.method, config.silentBrowserReady]);
  return null;
}
