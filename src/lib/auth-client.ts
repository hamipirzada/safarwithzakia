import { createAuthClient } from "better-auth/react";

/** Browser client for sign-in, sign-out and password reset. Same-origin; no secrets. */
export const authClient = createAuthClient({ basePath: "/api/auth" });

/** Only allow redirects to admin paths on this site after sign-in. */
export function safeAdminRedirect(next: string | null): string {
  if (!next || !next.startsWith("/admin") || next.startsWith("//") || next.includes("\\")) return "/admin";
  return next;
}
