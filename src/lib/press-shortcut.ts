import { press } from "@/lib/two-step";

/** Run a shortcut key through the same two steps: first press arms the button, second press does it. */
export function pressShortcut(id: string, action: () => void | Promise<unknown>): void {
  if (press(id)) void action();
}
