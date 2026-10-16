"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? "This reset link is invalid or has expired." : null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <p className="text-sm">
        This reset link is invalid or has expired. <Link href="/admin/forgot-password" className="link">Request a new one</Link>.
      </p>
    );
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setPending(true);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (resetError) return setError("This reset link is invalid or has expired.");
    router.replace("/admin/login?reset=1");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <h1 className="text-2xl">Choose a new password</h1>
      {error && <p role="alert" className="rounded-sm bg-danger-soft p-3 text-sm">{error}</p>}
      <div>
        <label htmlFor="password" className="field-label">New password</label>
        <input id="password" type="password" autoComplete="new-password" minLength={12} required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="field-hint">At least 12 characters. All your other sessions will be signed out.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="field-label">Confirm password</label>
        <input id="confirm" type="password" autoComplete="new-password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Set password"}</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
