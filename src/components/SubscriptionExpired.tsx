import { LogOut, MessageCircle, PauseCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { subscriptionText, whatsappLink, type Entitlements } from "@/lib/plans";
import logo from "@/assets/logo.png";

/*
 * The subscription has run out (the 7-day grace after the renewal date included) or XTSY has
 * paused it. The whole outlet stops here until XTSY records the renewal in the super admin
 * console — there is no self-serve renewal. Nothing is lost: bills and settings stay safe on
 * the devices and sync again the moment the plan is live.
 */
export function SubscriptionExpired({ plan, admin, restaurantName }: { plan: Entitlements; admin: boolean; restaurantName: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const paused = plan.status === "suspended";
  const signOut = async () => {
    await queryClient.cancelQueries(); queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/login", replace: true });
  };
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <img src={logo} alt="" width={40} height={40} className="mx-auto rounded-[10px]" />
        <PauseCircle className="mx-auto mt-4 size-10 text-warning" aria-hidden="true" />
        <h1 className="font-brand mt-3 text-3xl">{paused ? "Subscription paused" : "Subscription expired"}</h1>
        <p className="mt-1 text-sm font-semibold text-warning">{subscriptionText(plan)}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {restaurantName} is paused until the renewal is recorded by XTSY.
          {admin ? " Renewals are handled by XTSY (the super admin) — pay and it's switched back on in minutes." : " Please ask the admin to renew with XTSY."}
          {" "}Nothing is lost: bills and settings stay safe on this device and sync again the moment the plan is live.
        </p>
        {admin ? (
          <a href={whatsappLink(`Hi XTSY, please renew the ${plan.planName} plan for ${restaurantName}.`)} target="_blank" rel="noreferrer"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground hover:bg-primary-hover">
            <MessageCircle className="size-4" />Renew on WhatsApp
          </a>
        ) : null}
        <Button variant="ghost" className="mt-3 w-full" onClick={() => void signOut()}><LogOut />Sign out</Button>
      </div>
    </main>
  );
}
