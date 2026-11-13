import { createContext, useContext } from "react";
import type { Database } from "@/integrations/supabase/types";
import type { LoginId, LoginRow } from "./staff-login-logic";

export type StaffRole = Database["public"]["Enums"]["restaurant_role"];

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  captain: "Captain (waiter)",
  kitchen: "Kitchen",
};

export interface Membership {
  restaurantId: string;
  restaurantName: string;
  role: StaffRole;
}

export interface SignedInStaff {
  id: string;
  email: string;
  displayName: string;
  /** Role in the active restaurant; "unknown" until the user belongs to one. */
  role: StaffRole | "unknown";
  restaurantId: string | null;
  restaurantName: string;
  memberships: Membership[];
  /** admin, billdesk or waiter; null for any other account (such as the owner's own). */
  login: LoginId | null;
  /** That login's switch, devices and WhatsApp number, as the admin set them. */
  loginRow: LoginRow | null;
}

export interface AuthState {
  user: SignedInStaff | null;
  /** True until the first session check finishes. */
  loading: boolean;
  refresh: () => Promise<void>;
}

/** The signed-in staff member, filled in by <AuthProvider>. */
export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export function useStaff() {
  return useContext(AuthContext);
}

/** Owners and managers can change restaurant details, menu prices and staff. */
export function isAdmin(user: SignedInStaff | null): boolean {
  return user?.role === "owner" || user?.role === "manager";
}
