"use client";

import { useState, useTransition } from "react";
import { trackEnquiryAction, type TrackResult } from "@/app/(site)/actions";
import { Field } from "./FormParts";

export function TrackForm() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<TrackResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setResult(await trackEnquiryAction({ reference, email })));
      }}
    >
      <Field label="Reference number" required hint="For example SWZ-2610-7K3QX">
        {(p) => <input {...p} className="input font-mono uppercase" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />}
      </Field>
      <Field label="Email address" required>
        {(p) => <input {...p} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Checking…" : "Check status"}
      </button>
      <div aria-live="polite">
        {result &&
          (result.ok ? (
            <div className="rounded-sm border border-line bg-surface p-5">
              <p className="text-sm text-muted">
                {result.reference} · received {result.receivedOn}
              </p>
              <p className="mt-1 text-lg text-ink">{result.status}</p>
            </div>
          ) : (
            <p className="rounded-sm border border-line bg-surface p-5 text-ink-soft">{result.message}</p>
          ))}
      </div>
    </form>
  );
}
