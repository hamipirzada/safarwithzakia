import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { getAuth } from "./auth";
import { prisma } from "./db";

/**
 * Authorisation is enforced here, on the server, in every admin page, server action and
 * API handler. The proxy's cookie check is only a convenience redirect.
 */

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export class AuthorizationError extends Error {
  constructor(readonly reason: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(reason === "UNAUTHENTICATED" ? "Please sign in." : "You do not have permission to do that.");
    this.name = "AuthorizationError";
  }
}

/** Current staff user, re-read from the database so role changes and deactivation apply at once. */
export const getCurrentStaff = cache(async (): Promise<StaffUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

const RANK: Record<Role, number> = { STAFF: 1, ADMIN: 2 };

export function hasRole(user: StaffUser, minimum: Role): boolean {
  return RANK[user.role] >= RANK[minimum];
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requireStaff(minimum: Role = "STAFF"): Promise<StaffUser> {
  const user = await getCurrentStaff();
  if (!user) throw new AuthorizationError("UNAUTHENTICATED");
  if (!hasRole(user, minimum)) throw new AuthorizationError("FORBIDDEN");
  return user;
}

/** For admin pages: redirects to login, or to the dashboard when the role is insufficient. */
export async function requireStaffPage(minimum: Role = "STAFF", returnTo?: string): Promise<StaffUser> {
  const user = await getCurrentStaff();
  if (!user) redirect(returnTo ? `/admin/login?next=${encodeURIComponent(returnTo)}` : "/admin/login");
  if (!hasRole(user, minimum)) redirect("/admin?denied=1");
  return user;
}
