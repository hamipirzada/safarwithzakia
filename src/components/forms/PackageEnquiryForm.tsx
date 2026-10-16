"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { submitPackageEnquiryAction } from "@/app/(site)/actions";
import { addMonthsToMonth, todayInBusinessZone } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { BASIS_LABELS, type PricingBasis } from "@/domain/pricing";
import { fieldErrors, packageEnquirySchema } from "@/domain/schemas";
import { ACCOMMODATION_OPTIONS, LIMITS } from "@/domain/trip-options";
import { Field, FormAlert, Honeypot, SubmissionSuccess, rateLimitMessage, useSubmissionMeta } from "./FormParts";

export interface AddonOption {
  id: string;
  name: string;
  description: string | null;
  basis: PricingBasis;
  amountPaise: number;
}

export function PackageEnquiryForm({ packageId, packageTitle, addons }: { packageId: string; packageTitle: string; addons: AddonOption[] }) {
  const meta = useSubmissionMeta();
  const today = useMemo(() => todayInBusinessZone(new Date()), []);
  const [v, setV] = useState({
    dateMode: "exact" as "exact" | "month",
    startDate: "",
    travelMonth: "",
    adults: 2,
    children: 0,
    accommodation: "no-preference",
    addonIds: [] as string[],
    promoCode: "",
    name: "",
    email: "",
    phone: "",
    message: "",
    consent: false,
    swzCheck: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; total: number | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => {
    setV((s) => ({ ...s, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest);
  };

  if (result) {
    return (
      <SubmissionSuccess reference={result.reference}>
        {result.total !== null && (
          <p className="mt-3 text-ink-soft">
            Indicative estimate: <strong>{formatINR(result.total)}</strong>. We will confirm the final price in your quote.
          </p>
        )}
      </SubmissionSuccess>
    );
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const payload = { ...v, packageId, ...meta };
    const check = packageEnquirySchema(today).safeParse(payload);
    if (!check.success) {
      setErrors(fieldErrors(check.error));
      setFormError("Please check the highlighted fields.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const r = await submitPackageEnquiryAction(payload);
      if (r.ok) setResult({ reference: r.reference, total: r.estimate?.kind === "ESTIMATED" ? r.estimate.totalPaise : null });
      else if (r.error === "VALIDATION") {
        setErrors(r.fieldErrors);
        setFormError(r.fieldErrors._form ?? "Please check the highlighted fields.");
      } else if (r.error === "RATE_LIMITED") setFormError(rateLimitMessage(r.retryAfterSeconds));
      else setFormError(r.message);
    });
  };

  const number = (value: string) => (value === "" ? 0 : Number(value));

  return (
    <form onSubmit={onSubmit} noValidate className="relative space-y-5" aria-busy={pending} aria-label={`Enquire about ${packageTitle}`}>
      {formError && <FormAlert title={formError} />}
      <Honeypot value={v.swzCheck} onChange={(x) => set("swzCheck", x)} />

      <fieldset>
        <legend className="field-label">Travel dates</legend>
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-5">
          {(
            [
              ["exact", "Exact date"],
              ["month", "Month only"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2.5 text-sm">
              <input type="radio" name="pkgDateMode" checked={v.dateMode === value} onChange={() => set("dateMode", value)} className="h-5 w-5 accent-[var(--color-ink)]" />
              {label}
            </label>
          ))}
        </div>
        {v.dateMode === "exact" ? (
          <Field label="Arrival date" required error={errors.startDate}>
            {(p) => <input {...p} type="date" className="input" min={today} value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />}
          </Field>
        ) : (
          <Field label="Travel month" required error={errors.travelMonth}>
            {(p) => <input {...p} type="month" className="input" min={today.slice(0, 7)} max={addMonthsToMonth(today.slice(0, 7), LIMITS.maxAdvanceMonths)} value={v.travelMonth} onChange={(e) => set("travelMonth", e.target.value)} />}
          </Field>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Adults" required error={errors.adults}>
          {(p) => <input {...p} type="number" inputMode="numeric" min={1} max={LIMITS.maxAdults} className="input" value={v.adults} onChange={(e) => set("adults", number(e.target.value))} />}
        </Field>
        <Field label="Children" required error={errors.children} hint="Under 12">
          {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={LIMITS.maxChildren} className="input" value={v.children} onChange={(e) => set("children", number(e.target.value))} />}
        </Field>
      </div>

      <Field label="Accommodation preference" required error={errors.accommodation}>
        {(p) => (
          <select {...p} className="input" value={v.accommodation} onChange={(e) => set("accommodation", e.target.value)}>
            {ACCOMMODATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      {addons.length > 0 && (
        <fieldset>
          <legend className="field-label">
            Add-ons <span className="font-normal text-muted">(optional)</span>
          </legend>
          <ul className="space-y-2">
            {addons.map((a) => (
              <li key={a.id}>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-[var(--color-ink)]"
                    checked={v.addonIds.includes(a.id)}
                    onChange={(e) => set("addonIds", e.target.checked ? [...v.addonIds, a.id] : v.addonIds.filter((id) => id !== a.id))}
                  />
                  <span>
                    <span className="text-ink">{a.name}</span> — {formatINR(a.amountPaise)} {BASIS_LABELS[a.basis]}
                    {a.description && <span className="block text-muted">{a.description}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {errors.addonIds && <p className="field-error">{errors.addonIds}</p>}
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name}>
          {(p) => <input {...p} className="input" autoComplete="name" value={v.name} onChange={(e) => set("name", e.target.value)} />}
        </Field>
        <Field label="Email" required error={errors.email}>
          {(p) => <input {...p} type="email" className="input" autoComplete="email" value={v.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
      </div>
      <Field label="Phone or WhatsApp" required error={errors.phone}>
        {(p) => <input {...p} type="tel" className="input" autoComplete="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} />}
      </Field>
      <Field label="Promo code" error={errors.promoCode}>
        {(p) => <input {...p} className="input uppercase" autoComplete="off" value={v.promoCode} onChange={(e) => set("promoCode", e.target.value.toUpperCase())} />}
      </Field>
      <Field label="Message" error={errors.message}>
        {(p) => <textarea {...p} rows={3} className="input" value={v.message} onChange={(e) => set("message", e.target.value)} />}
      </Field>
      <div>
        <label className="flex items-start gap-3 text-sm text-ink-soft">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-ink)]" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={Boolean(errors.consent)} />
          <span>
            I agree that my details will be used to reply to this enquiry (<Link href="/privacy" className="link">privacy notice</Link>).
          </span>
        </label>
        {errors.consent && <p className="field-error">{errors.consent}</p>}
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send enquiry"}
      </button>
      <p className="text-xs leading-relaxed text-muted">An enquiry is not a booking. We reply with availability and a confirmed quote.</p>
    </form>
  );
}
