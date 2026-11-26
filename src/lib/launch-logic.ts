/** The launch animation plays once per app launch (sessionStorage survives reloads in a window). */
export const LAUNCH_KEY = "xtsy-launch-shown";
export const LAUNCH_MS = 3400;

export function shouldPlayLaunch(seen: string | null): boolean {
  return !seen;
}

/**
 * How far into the launch we are when the splash mounts again (the loading screen hands over
 * to the app mid-animation): the new copy carries on from there instead of starting over.
 * Returns null when there's nothing left worth showing.
 */
export function launchElapsed(startedAt: number, now: number, total = LAUNCH_MS): number | null {
  const t = Math.max(0, now - startedAt);
  return t < total - 450 ? t : null;
}
