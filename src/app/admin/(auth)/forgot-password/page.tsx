"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "pending" | "sent" | "limited">("idle");

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("pending");
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/admin/reset-password" });
    setState(error?.status === 429 ? "limited" : "sent");
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h1 className="text-2xl">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">We will email a reset link if the address belongs to a staff account.</p>
      </div>
      {state === "sent" ? (
        <p role="status" className="rounded-sm bg-success-soft p-3 text-sm">
          If that email belongs to a staff account, a reset link is on its way. It expires in one hour. If email delivery is not configured yet, ask an administrator to reset your password.
        </p>
      ) : (
        <>
          {state === "limited" && <p role="alert" className="rounded-sm bg-danger-soft p-3 text-sm">Too many requests. Please try again later.</p>}
          <div>
            <label htmlFor="email" className="field-label">Email</label>
            <input id="email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={state === "pending"}>
            {state === "pending" ? "Sending…" : "Send reset link"}
          </button>
        </>
      )}
      <p className="text-center text-sm"><Link href="/admin/login" className="link">Back to sign in</Link></p>
    </form>
  );
}
