/**
 * Server only. "Sign in as" for XTSY support (see support-logic.ts): a one-time session for a
 * restaurant login, after checking the super admin, the membership and that the login can sign
 * in. Every use is logged in account_events (kind support_sign_in) with the reason.
 */
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { supportReasonProblem } from "@/lib/support-logic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; auth: { admin: any } };
const admin = () => supabaseAdmin as unknown as Loose;

export interface SupportSignIn { restaurantId: string; userId: string; reason: string }
export interface SupportSessionTokens {
  accessToken: string; refreshToken: string; restaurantId: string; restaurantName: string;
  email: string; role: string; displayName: string; reason: string; by: string;
}

export async function supportSignIn(by: string, byEmail: string, input: SupportSignIn): Promise<SupportSessionTokens> {
  const problem = supportReasonProblem(input.reason);
  if (problem) throw new Error(problem);
  const reason = input.reason.trim();

  const [{ data: member }, { data: rest }] = await Promise.all([
    admin().from("restaurant_members").select("user_id, role, display_name, email").eq("restaurant_id", input.restaurantId).eq("user_id", input.userId).maybeSingle(),
    admin().from("restaurants").select("id, name, account_id").eq("id", input.restaurantId).maybeSingle(),
  ]);
  if (!rest) throw new Error("That restaurant doesn't exist.");
  if (!member) throw new Error("That login isn't part of this restaurant.");
  const m = member as { role: string; display_name: string; email: string };
  const r = rest as { name: string; account_id: string | null };

  const { data: u } = await admin().auth.admin.getUserById(input.userId);
  const user = u?.user as { email?: string; banned_until?: string | null } | undefined;
  const email = (user?.email ?? m.email ?? "").toLowerCase();
  if (!email) throw new Error("This login has no sign-in address.");
  if (user?.banned_until && Date.parse(user.banned_until) > Date.now()) throw new Error("This login's sign-in is switched off. Switch it on first if you really need to open it.");
  const [{ data: pa }, { data: pe }] = await Promise.all([
    admin().from("platform_admins").select("user_id").eq("user_id", input.userId).maybeSingle(),
    admin().from("platform_admin_emails").select("email").eq("email", email).maybeSingle(),
  ]);
  if (pa || pe) throw new Error("Super admin accounts can't be opened this way.");

  // A one-time sign-in link, used here on the server: no email is sent and no password is touched.
  const { data: link, error: linkError } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  const hashed = (link as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
  if (linkError || !hashed) throw new Error(`Couldn't open a session for ${email}: ${linkError?.message ?? "no link"}`);
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("The cloud isn't configured for support sign-in.");
  // A throwaway client: verifying would otherwise put the user's session on the shared admin client.
  const once = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
  const { data: verified, error: verifyError } = await once.auth.verifyOtp({ token_hash: hashed, type: "magiclink" });
  const session = verified?.session;
  if (verifyError || !session) throw new Error(`Couldn't open a session for ${email}: ${verifyError?.message ?? "no session"}`);

  if (r.account_id) {
    await admin().from("account_events").insert({
      account_id: r.account_id, kind: "support_sign_in", by_user: by,
      detail: { restaurant: input.restaurantId, user: input.userId, email, role: m.role, reason, by: byEmail },
    });
  }
  return {
    accessToken: session.access_token, refreshToken: session.refresh_token,
    restaurantId: input.restaurantId, restaurantName: r.name, email, role: m.role,
    displayName: m.display_name || email, reason, by: byEmail,
  };
}

/** Recent support sign-ins for one restaurant, newest first. */
export async function supportHistory(restaurantId: string): Promise<{ at: string; email: string; role: string; reason: string; by: string }[]> {
  const { data: rest } = await admin().from("restaurants").select("account_id").eq("id", restaurantId).maybeSingle();
  const account = (rest as { account_id?: string } | null)?.account_id;
  if (!account) return [];
  const { data } = await admin().from("account_events").select("created_at, detail").eq("account_id", account).eq("kind", "support_sign_in")
    .order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as { created_at: string; detail: Record<string, string> }[])
    .filter((e) => e.detail?.["restaurant"] === restaurantId)
    .slice(0, 20)
    .map((e) => ({ at: e.created_at, email: e.detail["email"] ?? "", role: e.detail["role"] ?? "", reason: e.detail["reason"] ?? "", by: e.detail["by"] ?? "" }));
}
