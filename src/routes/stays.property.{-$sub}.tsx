import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { DeskSetup } from "@/components/pms/DeskSetup";
import { EngineSyncCard } from "@/components/pms/EngineSync";
import { ExtrasEditor, RatePlans } from "@/components/pms/PlansAndExtras";
import { usePms } from "@/lib/pms/use-pms";
import { isAdmin, useStaff } from "@/lib/staff";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** Property set-up: room and bed types with their base rates, and the beds and rooms of each. */
export const Route = createFileRoute("/stays/property/{-$sub}")({
  params: SILENT_PARAMS,
  head: () => ({ meta: [{ title: "Property — XTSY" }, { name: "robots", content: "noindex" }] }),
  component: PropertyPage,
});

function PropertyPage() {
  const { user } = useStaff();
  const { types, units } = usePms();
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-6">
        <header>
          <p className="xt-eyebrow text-primary">Property</p>
          <h1 className="text-4xl">Rooms & rates</h1>
          <p className="text-sm text-muted-foreground">
            Base rates are per bed or room per night, before GST. Change single nights under Rates &
            availability.
          </p>
        </header>
        {isAdmin(user) ? (
          <>
            <EngineSyncCard />
            <DeskSetup types={types} units={units} />
            {types.length ? <RatePlans types={types} /> : null}
            <ExtrasEditor />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            The owner or a manager sets up rooms and rates.
          </p>
        )}
      </div>
    </AppShell>
  );
}
