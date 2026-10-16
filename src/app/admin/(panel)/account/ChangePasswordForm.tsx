"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Self-service password change. You stay signed in here; other devices are signed out. */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (next.length < 12) return setResult({ ok: false, message: "The new password must be at least 12 characters." });
    if (next !== confirm) return setResult({ ok: false, message: "The new passwords do not match." });
    setPending(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setPending(false);
    if (error) {
      setResult({
        ok: false,
        message: error.status === 429 ? "Too many attempts. Please wait a few minutes." : error.code === "INVALID_PASSWORD" ? "Your current password is incorrect." : "The password could not be changed. Please try again.",
      });
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setResult({ ok: true, message: "Password changed. You are still signed in here; any other devices have been signed out." });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`rounded-sm px-3 py-2 text-sm ${result.ok ? "bg-success-soft" : "bg-danger-soft"}`}>
          {result.message}
        </p>
      )}
      <div>
        <label htmlFor="current-password" className="field-label">Current password</label>
        <input id="current-password" type="password" autoComplete="current-password" required className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div>
        <label htmlFor="new-password" className="field-label">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={12} required className="input" value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="field-hint">At least 12 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm-password" className="field-label">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
