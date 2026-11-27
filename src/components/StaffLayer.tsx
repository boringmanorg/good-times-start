import type { ReactNode } from "react";
import { PersistentFrame } from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth-context";
import { AppInstall } from "@/components/AppInstall";
import { LiveSync } from "@/components/LiveSync";
import { PreloadScreens } from "@/components/PreloadScreens";
import { CounterPrintWatcher, IncomingKotWatcher, PrintHost } from "@/components/PrintHost";

/**
 * Everything the staff apps need around every screen. Loaded only off public pages (see
 * public-paths.ts). The sign-in state starts here, inside the lazy boundary: if it started above,
 * it would finish loading before this chunk arrives and the first render would not match the
 * server's HTML (hydration error on every staff screen).
 */
export default function StaffLayer({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LiveSync />
      <PrintHost />
      <IncomingKotWatcher />
      <CounterPrintWatcher />
      <AppInstall />
      <PreloadScreens />
      <PersistentFrame>{children}</PersistentFrame>
    </AuthProvider>
  );
}
