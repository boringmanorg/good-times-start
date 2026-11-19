import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { setAppMode } from "@/lib/app-mode";
import { useStaff } from "@/lib/staff";
import { prepareOutletSwitch } from "@/lib/outlet-actions";
import { HANDOFF_KEY, readHandoff, sessionFromHandoff, supportAppFor, supportHome } from "@/lib/support-logic";
import { beginSupport, clearSupport } from "@/lib/support-session";
import logo from "@/assets/logo.png";

/**
 * XTSY support lands here from the console's "Sign in as" (support-logic.ts). The session comes
 * through localStorage, is read once, and only works for two minutes.
 */
export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "XTSY support · XTSY POS" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SupportPage,
});

function SupportPage() {
  const navigate = useNavigate();
  const { refresh } = useStaff();
  const [problem, setProblem] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      let raw: string | null = null;
      try { raw = window.localStorage.getItem(HANDOFF_KEY); window.localStorage.removeItem(HANDOFF_KEY); } catch { /* storage unavailable */ }
      const handoff = readHandoff(raw);
      if (!handoff) { setProblem("This support link has expired or was already used. Go back to the console and choose Sign in as again."); return; }
      // This browser holds one outlet's data at a time: never wipe work that hasn't reached the cloud.
      const blocked = await prepareOutletSwitch(handoff.restaurantId);
      if (blocked) { setProblem(`This browser has work for another outlet. ${blocked} Or open the console in a separate browser profile for support.`); return; }
      const { error } = await supabase.auth.setSession({ access_token: handoff.accessToken, refresh_token: handoff.refreshToken });
      if (error) { setProblem(`Couldn't open the session: ${error.message}`); return; }
      beginSupport(sessionFromHandoff(handoff));
      setAppMode(supportAppFor(handoff.email, handoff.role));
      await refresh();
      await navigate({ to: supportHome(handoff.email, handoff.role) as "/dashboard", replace: true });
    })().catch((e: unknown) => {
      clearSupport();
      setProblem(e instanceof Error ? e.message : "Couldn't open the support session.");
    });
  }, [navigate, refresh]);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="max-w-sm text-center">
        <img src={logo} alt="" width={40} height={40} className="mx-auto rounded-xl" />
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"><LifeBuoy className="size-4" />XTSY support</p>
        {problem ? <>
          <p role="alert" className="mt-3 text-sm text-destructive">{problem}</p>
          <Button variant="outline" className="mt-5" onClick={() => window.close()}>Close this tab</Button>
        </> : <p className="mt-3 text-sm text-muted-foreground">Opening the restaurant's app…</p>}
      </div>
    </main>
  );
}
