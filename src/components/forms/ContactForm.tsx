"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { contactSchema, fieldErrors } from "@/domain/schemas";
import { submitContactAction } from "@/app/(site)/actions";
import { Field, FormAlert, Honeypot, SubmissionSuccess, rateLimitMessage, useSubmissionMeta } from "./FormParts";

export function ContactForm() {
  const meta = useSubmissionMeta();
  const [values, setValues] = useState({ name: "", email: "", phone: "", message: "", consent: false, swzCheck: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest);
  };

  if (reference) return <SubmissionSuccess reference={reference} />;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const payload = { ...values, ...meta };
    const check = contactSchema.safeParse(payload);
    if (!check.success) {
      setErrors(fieldErrors(check.error));
      setFormError("Please check the highlighted fields.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const result = await submitContactAction(payload);
      if (result.ok) setReference(result.reference);
      else if (result.error === "VALIDATION") {
        setErrors(result.fieldErrors);
        setFormError(result.fieldErrors._form ?? "Please check the highlighted fields.");
      } else if (result.error === "RATE_LIMITED") setFormError(rateLimitMessage(result.retryAfterSeconds));
      else setFormError(result.message);
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-5" aria-busy={pending}>
      {formError && <FormAlert title={formError} />}
      <Honeypot value={values.swzCheck} onChange={(v) => set("swzCheck", v)} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name}>
          {(p) => <input {...p} className="input" name="name" autoComplete="name" value={values.name} onChange={(e) => set("name", e.target.value)} />}
        </Field>
        <Field label="Email" required error={errors.email}>
          {(p) => <input {...p} className="input" type="email" name="email" autoComplete="email" value={values.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
      </div>
      <Field label="Phone or WhatsApp number" error={errors.phone} hint="Include your country code if you are outside India.">
        {(p) => <input {...p} className="input" type="tel" name="phone" autoComplete="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} />}
      </Field>
      <Field label="Your message" required error={errors.message}>
        {(p) => (
          <textarea {...p} className="input" name="message" rows={6} placeholder="When are you thinking of travelling, and what would you like to see?" value={values.message} onChange={(e) => set("message", e.target.value)} />
        )}
      </Field>
      <div>
        <label className="flex items-start gap-3 text-sm text-ink-soft">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-ink)]" checked={values.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={Boolean(errors.consent)} />
          <span>
            I agree that {""}my details will be used to reply to this enquiry, as described in the <Link href="/privacy" className="link">privacy notice</Link>.
          </span>
        </label>
        {errors.consent && <p className="field-error">{errors.consent}</p>}
      </div>
      <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
