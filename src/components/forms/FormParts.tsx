"use client";

import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/** Per-form-instance anti-spam and duplicate-protection values. */
export function useSubmissionMeta() {
  const [meta] = useState(() => ({ submissionKey: crypto.randomUUID(), startedAt: Date.now() }));
  return meta;
}

/**
 * Honeypot input: invisible to people and assistive tech, attractive to bots.
 * Its name and label are deliberately unlike anything browsers autofill (a field called
 * "website" was being filled by Chrome autofill, flagging real customers as spam).
 */
export function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Leave this field empty
        <input type="text" name="swzCheck" tabIndex={-1} autoComplete="off" data-1p-ignore data-lpignore="true" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required ? <span className="text-danger"> *</span> : <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormAlert({ title, children }: { title: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [title]);
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="flex gap-3 rounded-sm border border-danger/30 bg-danger-soft p-4 text-sm text-ink outline-none">
      <AlertTriangle aria-hidden size={18} className="mt-0.5 shrink-0 text-danger" />
      <div>
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-ink-soft">{children}</div>}
      </div>
    </div>
  );
}

export function SubmissionSuccess({ reference, children }: { reference: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="rounded-sm border border-success/30 bg-success-soft p-6 outline-none sm:p-8">
      <CheckCircle2 aria-hidden size={28} className="text-success" />
      <h2 className="mt-4 text-2xl text-ink">Thank you — we have your enquiry</h2>
      <p className="mt-3 leading-relaxed text-ink-soft">
        Your reference is{" "}
        <strong className="rounded-xs bg-surface px-1.5 py-0.5 font-mono text-ink" data-testid="enquiry-reference">
          {reference}
        </strong>
        . Please keep it handy if you contact us. A member of our team will reply personally.
      </p>
      {children}
      <p className="mt-4 text-sm text-muted">
        This is an enquiry, not a booking — nothing is reserved until you agree a plan and quote with us. You can{" "}
        <Link href="/track" className="link">check its status</Link> at any time.
      </p>
    </div>
  );
}

export function rateLimitMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `You have sent several requests in a short time. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or contact us by phone or WhatsApp.`;
}
