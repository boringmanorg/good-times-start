import { useState } from "react";
import { LifeBuoy, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDb, resetDevice } from "@/lib/db";
import { supportBannerText } from "@/lib/support-logic";
import { clearSupport, currentSupport } from "@/lib/support-session";

/**
 * Shown on every staff screen during an XTSY support session ("Sign in as" from the console),
 * so nobody mistakes it for the restaurant's own sign-in. End support signs out and clears this
 * browser — but only once everything done during support has reached the cloud.
 */
export function SupportBanner() {
  const session = currentSupport();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!session) return null;
  const end = async () => {
    setBusy(true);
    try {
      const waiting = await getDb().outbox.count();
      if (waiting > 0) { toast.error(`${waiting} change${waiting === 1 ? " is" : "s are"} still on the way to the cloud. Wait a moment (or Sync now), then end support.`); return; }
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      await resetDevice();
      clearSupport();
      window.location.replace("/login");
    } finally { setBusy(false); }
  };
  return (
    <div role="status" className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border-2 border-black bg-[#e9b949] px-3 py-1.5 text-center text-xs font-semibold text-black shadow-lg">
      <span className="inline-flex items-center gap-1.5"><LifeBuoy className="size-3.5" />{supportBannerText(session)}</span>
      <span className="font-normal">Reason: {session.reason}</span>
      <button type="button" disabled={busy} onClick={() => void end()} className="inline-flex items-center gap-1 rounded-full bg-black px-2.5 py-0.5 text-[11px] text-[#e9b949] hover:opacity-90">
        <LogOut className="size-3" />{busy ? "Ending…" : "End support"}
      </button>
    </div>
  );
}
