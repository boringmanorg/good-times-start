/**
 * The staff apps' cloud connection. Restaurant POS uses the project's generated client (its
 * saved sign-in is unchanged); a Hostel/Hotel/Resort POS tab gets its own client with its own
 * saved sign-in, so both apps can be signed in at once in one browser (app-space.ts).
 * Import `supabase` from here in app code, not from @/integrations/supabase/client.
 */
import { createClient } from "@supabase/supabase-js";
import { supabase as generated } from "@/integrations/supabase/client";
import { brokeredPreviewStorage } from "@/integrations/supabase/previewAuthStorage";
import type { Database } from "@/integrations/supabase/types";
import { appSpace } from "./app-space";

type Client = typeof generated;
let stay: Client | undefined;

function stayClient(): Client {
  if (stay) return stay;
  const url = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  const storage = brokeredPreviewStorage();
  stay = createClient<Database>(url, key, {
    auth: { storageKey: "xtsy-stay-auth", ...(storage ? { storage } : {}), persistSession: true, autoRefreshToken: true },
  }) as Client;
  return stay;
}

export const supabase = new Proxy({} as Client, {
  get(_, prop) {
    const client = typeof window !== "undefined" && appSpace() === "stay" ? stayClient() : generated;
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
