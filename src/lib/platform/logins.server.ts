/**
 * Server only. Super admin control of restaurant logins: create, rename (email), role,
 * password, sign-in on/off and removal. Uses the service role, so every call first checks
 * that the caller is a super admin (is_platform_admin, with the caller's own session).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { passwordProblem } from "@/lib/staff-login-logic";
import { cleanEmail, emailProblem, isStaffRole, wouldLeaveNoOwner } from "@/lib/platform-login-logic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any; auth: { admin: any; getUser: (t: string) => any } };
const admin = () => supabaseAdmin as unknown as Loose;
const BANNED_FOREVER = "876000h"; // ~100 years: "sign-in off" until switched back on

/** The super admin behind a console session token; throws for anyone else. */
export async function superAdminFromToken(token: string): Promise<string> {
  const { data, error } = await admin().auth.getUser(token);
  const user = data?.user as { id: string; email?: string; email_confirmed_at?: string | null } | undefined;
  if (error || !user) throw new Error("Your console session has ended. Sign in again.");
  if (!user.email_confirmed_at || !(await isPlatformAccount(user.id, user.email ?? ""))) throw new Error("Super admin only.");
  return user.id;
}

interface Member { user_id: string; role: string; display_name: string; email: string }

async function members(restaurantId: string): Promise<(Member & { signInOff: boolean })[]> {
  const { data, error } = await admin().from("restaurant_members").select("user_id, role, display_name, email").eq("restaurant_id", restaurantId);
  if (error) throw new Error("Couldn't read the restaurant's logins.");
  const rows = (data ?? []) as Member[];
  return Promise.all(rows.map(async (m) => {
    const { data: u } = await admin().auth.admin.getUserById(m.user_id);
    const banned = u?.user?.banned_until ? Date.parse(u.user.banned_until) > Date.now() : false;
    return { ...m, signInOff: banned };
  }));
}

async function isPlatformAccount(userId: string, email: string): Promise<boolean> {
  const [{ data: byId }, { data: byEmail }] = await Promise.all([
    admin().from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    admin().from("platform_admin_emails").select("email").eq("email", cleanEmail(email)).maybeSingle(),
  ]);
  return Boolean(byId || byEmail);
}

async function log(restaurantId: string, by: string, detail: Record<string, unknown>) {
  const { data } = await admin().from("restaurants").select("account_id").eq("id", restaurantId).maybeSingle();
  const account = (data as { account_id?: string } | null)?.account_id;
  if (account) await admin().from("account_events").insert({ account_id: account, kind: "login_changed", detail: { restaurant: restaurantId, ...detail }, by_user: by });
}

export interface CreateLogin { restaurantId: string; email: string; password: string; role: string; displayName: string }

export async function createLogin(by: string, input: CreateLogin): Promise<{ userId: string; email: string }> {
  const email = cleanEmail(input.email);
  const problem = emailProblem(email) ?? passwordProblem(input.password) ?? (isStaffRole(input.role) ? null : "Choose a role.");
  if (problem) throw new Error(problem);
  const { data: rest } = await admin().from("restaurants").select("id").eq("id", input.restaurantId).maybeSingle();
  if (!rest) throw new Error("That restaurant doesn't exist.");
  const name = input.displayName.trim().slice(0, 60) || email.split("@")[0]!;
  const { data, error } = await admin().auth.admin.createUser({ email, password: input.password, email_confirm: true, user_metadata: { display_name: name } });
  if (error || !data?.user) {
    throw new Error(/already|registered|exists/i.test(error?.message ?? "") ? `${email} is already used by another login.` : `Couldn't create the login: ${error?.message ?? "unknown error"}`);
  }
  const userId = data.user.id as string;
  await admin().from("profiles").upsert({ id: userId, display_name: name }, { onConflict: "id" });
  const { error: mErr } = await admin().from("restaurant_members").insert({ restaurant_id: input.restaurantId, user_id: userId, role: input.role, display_name: name, email });
  if (mErr) {
    await admin().auth.admin.deleteUser(userId); // don't leave an orphan sign-in behind
    throw new Error("Couldn't add the login to the restaurant.");
  }
  await log(input.restaurantId, by, { action: "created", email, role: input.role });
  return { userId, email };
}

export interface UpdateLogin { restaurantId: string; userId: string; email?: string | undefined; displayName?: string | undefined; role?: string | undefined; password?: string | undefined; signIn?: boolean | undefined; remove?: boolean | undefined }

export async function updateLogin(by: string, input: UpdateLogin): Promise<{ email: string }> {
  const staff = await members(input.restaurantId);
  const target = staff.find((m) => m.user_id === input.userId);
  if (!target) throw new Error("That login isn't part of this restaurant.");
  const { data: u } = await admin().auth.admin.getUserById(input.userId);
  const currentEmail = cleanEmail(u?.user?.email ?? target.email ?? "");
  if (await isPlatformAccount(input.userId, currentEmail)) throw new Error("This is a super admin account. Change it in Lovable Cloud → Users.");
  if (input.role !== undefined && !isStaffRole(input.role)) throw new Error("Choose a role.");
  if (wouldLeaveNoOwner(staff.map((m) => ({ userId: m.user_id, role: m.role, signInOff: m.signInOff })),
    { userId: input.userId, ...(input.role !== undefined ? { role: input.role } : {}), ...(input.signIn !== undefined ? { signInOff: !input.signIn } : {}), ...(input.remove ? { remove: true } : {}) })) {
    throw new Error("The restaurant must keep at least one owner who can sign in. Make another login the owner first.");
  }

  const { data: internal } = await admin().from("staff_logins").select("login").eq("user_id", input.userId).maybeSingle();
  const internalLogin = (internal as { login?: string } | null)?.login ?? null;

  if (input.remove) {
    // Internal logins (admin / billdesk / waiter) are switched off; others leave the restaurant.
    if (internalLogin) await admin().from("staff_logins").update({ active: false }).eq("login", internalLogin);
    else await admin().from("restaurant_members").delete().eq("restaurant_id", input.restaurantId).eq("user_id", input.userId);
    await admin().auth.admin.updateUserById(input.userId, { ban_duration: BANNED_FOREVER });
    await log(input.restaurantId, by, { action: "removed", email: currentEmail });
    return { email: currentEmail };
  }

  let email = currentEmail;
  const authChanges: Record<string, unknown> = {};
  if (input.email !== undefined && cleanEmail(input.email) !== currentEmail) {
    const problem = emailProblem(input.email);
    if (problem) throw new Error(problem);
    email = cleanEmail(input.email);
    authChanges["email"] = email;
    authChanges["email_confirm"] = true;
  }
  if (input.password) {
    const problem = passwordProblem(input.password);
    if (problem) throw new Error(problem);
    authChanges["password"] = input.password;
  }
  if (input.signIn !== undefined) authChanges["ban_duration"] = input.signIn ? "none" : BANNED_FOREVER;
  if (input.displayName !== undefined) authChanges["user_metadata"] = { display_name: input.displayName.trim().slice(0, 60) };
  if (Object.keys(authChanges).length) {
    const { error } = await admin().auth.admin.updateUserById(input.userId, authChanges);
    if (error) throw new Error(/already|registered|exists/i.test(error.message) ? `${email} is already used by another login.` : `Couldn't update the login: ${error.message}`);
  }

  const row: Record<string, unknown> = {};
  if (email !== currentEmail) row["email"] = email;
  if (input.role !== undefined) row["role"] = input.role;
  if (input.displayName !== undefined) row["display_name"] = input.displayName.trim().slice(0, 60);
  if (Object.keys(row).length) {
    // The staff_logins trigger copies email / role / name onto the membership for internal logins.
    if (internalLogin) await admin().from("staff_logins").update(row).eq("login", internalLogin);
    await admin().from("restaurant_members").update(row).eq("restaurant_id", input.restaurantId).eq("user_id", input.userId);
    if (row["display_name"] !== undefined) await admin().from("profiles").upsert({ id: input.userId, display_name: row["display_name"] }, { onConflict: "id" });
  }
  await log(input.restaurantId, by, {
    action: "changed", email,
    ...(email !== currentEmail ? { from: currentEmail } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.password ? { password: "reset" } : {}),
    ...(input.signIn !== undefined ? { signIn: input.signIn ? "on" : "off" } : {}),
  });
  return { email };
}
