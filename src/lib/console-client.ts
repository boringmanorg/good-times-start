import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * The super admin console's own cloud connection, with its own saved sign-in
 * ("xtsy-console-auth"). It never shares a session with the staff apps, so signing in to the
 * console doesn't sign POS Manager / POS Billdesk out on the same browser, and a staff
 * session never stands in for the super admin.
 */
let client: SupabaseClient | undefined;

export function consoleClient(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env["VITE_SUPABASE_URL"] as string;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  client = createClient(url, key, {
    auth: { storageKey: "xtsy-console-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
  });
  return client;
}

/** The console session's access token, sent with super admin actions that run on the server. */
export async function consoleToken(): Promise<string> {
  const { data } = await consoleClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your console session has ended. Sign in again.");
  return token;
}
