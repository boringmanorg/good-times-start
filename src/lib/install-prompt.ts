import { useSyncExternalStore } from "react";

/* The browser's install prompt (Chrome / Edge / Android), kept until the person taps Install. */

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** Listen for the browser offering to install the app. Returns the cleanup. */
export function watchInstallPrompt(): () => void {
  const onPrompt = (e: Event) => { e.preventDefault(); deferred = e as InstallEvent; emit(); };
  const onInstalled = () => { deferred = null; emit(); };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function useInstallPrompt() {
  const available = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => deferred !== null,
    () => false,
  );
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    deferred = null;
    emit();
  };
  return { available, install };
}
