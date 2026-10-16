"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient, safeAdminRedirect } from "@/lib/auth-client";

export function LoginForm({ next, passwordReset }: { next: string | null; passwordReset: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      setPending(false);
      // Same message for unknown email, wrong password and deactivated accounts; but never blame
      // the password when the server itself failed (e.g. database outage).
      setError(
        signInError.status === 429
          ? "Too many attempts. Please wait a few minutes and try again."
          : signInError.code === "INVALID_ORIGIN"
            ? // Not a credentials problem: the page was opened from an address the server does not trust (APP_URL).
              "Sign-in is not available from this web address. Open the admin from the site's main address."
          : (signInError.status ?? 0) >= 500
            ? "Sign-in is temporarily unavailable. Please try again in a few minutes."
            : "The email or password is incorrect.",
      );
      return;
    }
    router.replace(safeAdminRedirect(next));
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h1 className="text-2xl">Staff sign in</h1>
        <p className="mt-1 text-sm text-muted">For Safar With Zakia staff only.</p>
      </div>
      {passwordReset && <p role="status" className="rounded-sm bg-success-soft p-3 text-sm">Your password was changed. Please sign in.</p>}
      {error && <p role="alert" className="rounded-sm bg-danger-soft p-3 text-sm">{error}</p>}
      <div>
        <label htmlFor="email" className="field-label">Email</label>
        <input id="email" type="email" autoComplete="username" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label htmlFor="password" className="field-label">Password</label>
        <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm">
        <Link href="/admin/forgot-password" className="link">Forgot your password?</Link>
      </p>
    </form>
  );
}
