"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { estimateTripAction, submitTripAction } from "@/app/(site)/actions";
import { addMonthsToMonth, formatIsoDate, formatIsoMonth, todayInBusinessZone } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { Estimate } from "@/domain/pricing";
import { customTripSchema, fieldErrors } from "@/domain/schemas";
import { ACCOMMODATION_OPTIONS, INTEREST_OPTIONS, LIMITS, TRANSPORT_OPTIONS, accommodationLabel, interestLabel, transportLabel } from "@/domain/trip-options";
import { Field, FormAlert, Honeypot, SubmissionSuccess, rateLimitMessage, useSubmissionMeta } from "./FormParts";

export interface BuilderDestination {
  id: string;
  slug: string;
  name: string;
  summary: string;
  recommendedDuration: string | null;
  priceLabel: string | null;
}

interface Leg {
  key: string;
  destinationId: string;
  days: number;
}

interface TripState {
  legs: Leg[];
  dateMode: "exact" | "month";
  startDate: string;
  travelMonth: string;
  adults: number;
  children: number;
  accommodation: string;
  transport: string;
  interests: string[];
  budget: string;
  promoCode: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
  swzCheck: string;
}

const STEPS = [
  { title: "Route", fields: ["legs"] },
  { title: "Dates & travellers", fields: ["dateMode", "startDate", "travelMonth", "adults", "children"] },
  { title: "Preferences", fields: ["accommodation", "transport", "interests", "budget", "promoCode"] },
  { title: "Your details", fields: ["name", "email", "phone", "message", "consent"] },
  { title: "Review", fields: [] },
] as const;

const DRAFT_KEY = "swz-trip-draft-v1";
const newKey = () => crypto.randomUUID();

function initialState(preselected: string | null): TripState {
  return {
    legs: [{ key: newKey(), destinationId: preselected ?? "", days: 2 }],
    dateMode: "exact",
    startDate: "",
    travelMonth: "",
    adults: 2,
    children: 0,
    accommodation: "no-preference",
    transport: "no-preference",
    interests: [],
    budget: "",
    promoCode: "",
    name: "",
    email: "",
    phone: "",
    message: "",
    consent: false,
    swzCheck: "",
  };
}

function Stepper({ value, min, max, onChange, label, id }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; id?: string }) {
  return (
    <div className="inline-flex items-center rounded-sm border border-line-strong bg-surface">
      <button type="button" className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label}`}>
        <Minus aria-hidden size={16} />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-14 border-x border-line text-center [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label={label}
      />
      <button type="button" className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label}`}>
        <Plus aria-hidden size={16} />
      </button>
    </div>
  );
}

export function EstimatePanel({ estimate, loading, error }: { estimate: Estimate | null; loading: boolean; error: string | null }) {
  return (
    <div aria-live="polite" aria-busy={loading}>
      {error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : !estimate ? (
        <p className="text-sm text-muted">Choose destinations and travel dates to see whether published rates apply.</p>
      ) : estimate.kind === "ESTIMATED" ? (
        <div>
          <p className="text-xs tracking-wide text-muted uppercase">Indicative estimate</p>
          <p className="mt-1 font-display text-3xl text-ink" data-testid="estimate-total">
            {formatINR(estimate.totalPaise)}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {estimate.lines.map((line) => (
              <li key={line.label + line.detail} className="flex justify-between gap-4">
                <span className="text-ink-soft">
                  {line.label}
                  <span className="block text-xs text-muted">{line.detail}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatINR(line.amountPaise)}</span>
              </li>
            ))}
            {estimate.promo && (
              <li className={`flex justify-between gap-4 ${estimate.promo.applied ? "text-success" : "text-muted"}`}>
                <span>
                  {estimate.promo.code}
                  <span className="block text-xs">{estimate.promo.message}</span>
                </span>
                {estimate.promo.applied && <span className="tabular-nums">−{formatINR(estimate.promo.discountPaise)}</span>}
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">Based on published rates. Your confirmed price comes in our quote.</p>
        </div>
      ) : (
        <div>
          <p className="font-display text-2xl text-ink" data-testid="estimate-quote">
            Request a quote
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {estimate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {estimate.promo && <p className="mt-2 text-sm text-muted">{estimate.promo.code}: {estimate.promo.message}</p>}
          <p className="mt-3 text-xs leading-relaxed text-muted">You can still send your trip — we will price it for you.</p>
        </div>
      )}
    </div>
  );
}

export function TripBuilder({ destinations, preselectedId }: { destinations: BuilderDestination[]; preselectedId: string | null }) {
  const meta = useSubmissionMeta();
  const [state, setState] = useState<TripState>(() => initialState(preselectedId));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [submittedEstimate, setSubmittedEstimate] = useState<Estimate | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restored = useRef(false);

  const today = useMemo(() => todayInBusinessZone(new Date()), []);
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonthsToMonth(thisMonth, LIMITS.maxAdvanceMonths);
  const byId = useMemo(() => new Map(destinations.map((d) => [d.id, d])), [destinations]);
  const totalDays = state.legs.reduce((n, l) => n + (Number.isFinite(l.days) ? l.days : 0), 0);

  // Restore an unsent draft from this browser session (not when a destination was preselected via link).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (preselectedId) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<TripState>;
      const legs = (draft.legs ?? []).filter((l) => !l.destinationId || byId.has(l.destinationId));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage after hydration
      setState((s) => ({ ...s, ...draft, legs: legs.length ? legs : s.legs, consent: false, swzCheck: "" }));
    } catch {
      /* storage unavailable */
    }
  }, [byId, preselectedId]);

  useEffect(() => {
    try {
      const { consent: _c, swzCheck: _h, ...draft } = state;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  // Live estimate from the server, debounced. Only when the inputs it needs are complete.
  const estimateInput = useMemo(
    () => ({
      legs: state.legs.map(({ destinationId, days }) => ({ destinationId, days })),
      dateMode: state.dateMode,
      startDate: state.startDate,
      travelMonth: state.travelMonth,
      adults: state.adults,
      children: state.children,
      promoCode: state.promoCode,
    }),
    [state.legs, state.dateMode, state.startDate, state.travelMonth, state.adults, state.children, state.promoCode],
  );
  const estimateReady =
    state.legs.length > 0 && state.legs.every((l) => l.destinationId && l.days >= 1) && (state.dateMode === "exact" ? Boolean(state.startDate) : Boolean(state.travelMonth));

  useEffect(() => {
    if (!estimateReady) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale estimate when inputs become incomplete
      setEstimate(null);
      setEstimateError(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    const timer = setTimeout(async () => {
      const result = await estimateTripAction(estimateInput).catch(() => null);
      if (cancelled) return;
      setEstimating(false);
      if (!result) setEstimateError("We could not calculate an estimate right now.");
      else if (result.ok) {
        setEstimate(result.estimate);
        setEstimateError(null);
      } else if (result.error === "RATE_LIMITED") setEstimateError("Estimates are paused for a moment — please wait.");
      else {
        setEstimate(null);
        setEstimateError(Object.values(result.fieldErrors)[0] ?? null);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [estimateInput, estimateReady]);

  const update = <K extends keyof TripState>(key: K, value: TripState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key && !k.startsWith(`${key}.`))));
  };

  const updateLeg = (key: string, patch: Partial<Leg>) => {
    setState((s) => ({ ...s, legs: s.legs.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("legs"))));
  };
  const moveLeg = (index: number, direction: -1 | 1) => {
    setState((s) => {
      const legs = [...s.legs];
      const target = index + direction;
      if (target < 0 || target >= legs.length) return s;
      [legs[index], legs[target]] = [legs[target]!, legs[index]!];
      return { ...s, legs };
    });
  };

  const payload = () => ({
    ...state,
    legs: state.legs.map(({ destinationId, days }) => ({ destinationId, days })),
    ...meta,
  });

  /** Validate everything, then keep only the errors belonging to the given steps. */
  const validateSteps = (upTo: number): Record<string, string> => {
    const result = customTripSchema(today).safeParse(payload());
    if (result.success) return {};
    const all = fieldErrors(result.error);
    const fields = STEPS.slice(0, upTo + 1).flatMap((s) => s.fields as readonly string[]);
    return Object.fromEntries(Object.entries(all).filter(([key]) => fields.some((f) => key === f || key.startsWith(`${f}.`))));
  };

  const goTo = (target: number) => {
    setStep(target);
    setFormError(null);
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const next = () => {
    const stepErrors = validateSteps(step);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      setFormError(stepErrors._form ?? "Please check the highlighted fields.");
      return;
    }
    setErrors({});
    goTo(step + 1);
  };

  const submit = () => {
    if (pending) return;
    const all = validateSteps(STEPS.length - 1);
    if (Object.keys(all).length) {
      setErrors(all);
      const firstStep = STEPS.findIndex((s) => Object.keys(all).some((k) => (s.fields as readonly string[]).some((f) => k === f || k.startsWith(`${f}.`))));
      setFormError("Some details need attention before you send.");
      if (firstStep >= 0) goTo(firstStep);
      return;
    }
    startTransition(async () => {
      const result = await submitTripAction(payload());
      if (result.ok) {
        setReference(result.reference);
        setSubmittedEstimate(result.estimate);
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
      } else if (result.error === "VALIDATION") {
        setErrors(result.fieldErrors);
        setFormError(result.fieldErrors._form ?? "Some details need attention before you send.");
      } else if (result.error === "RATE_LIMITED") {
        setFormError(rateLimitMessage(result.retryAfterSeconds));
      } else {
        setFormError(result.message);
      }
    });
  };

  if (reference) {
    return (
      <div className="mx-auto max-w-2xl">
        <SubmissionSuccess reference={reference}>
          {submittedEstimate?.kind === "ESTIMATED" && (
            <p className="mt-3 text-ink-soft">
              Indicative estimate: <strong>{formatINR(submittedEstimate.totalPaise)}</strong>. We will confirm the final price in your quote.
            </p>
          )}
        </SubmissionSuccess>
      </div>
    );
  }

  const legLabel = (leg: Leg) => byId.get(leg.destinationId)?.name ?? "Choose a destination";
  const datesText = state.dateMode === "exact" ? (state.startDate ? formatIsoDate(state.startDate) : "—") : state.travelMonth ? `${formatIsoMonth(state.travelMonth)} (flexible)` : "—";

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
      <div>
        {/* Progress */}
        <nav aria-label="Trip builder steps">
          <ol className="flex gap-1.5">
            {STEPS.map((s, index) => (
              <li key={s.title} className="flex-1">
                <button
                  type="button"
                  onClick={() => index < step && goTo(index)}
                  disabled={index >= step}
                  aria-current={index === step ? "step" : undefined}
                  aria-label={`Step ${index + 1}: ${s.title}${index < step ? " (go back)" : ""}`}
                  className="group w-full text-left disabled:cursor-default"
                >
                  <span className={`block h-1 rounded-full ${index <= step ? "bg-ink" : "bg-line"}`} />
                  <span className={`mt-2 hidden text-xs font-medium sm:block ${index === step ? "text-ink" : "text-muted"} ${index < step ? "group-hover:underline" : ""}`}>
                    {index + 1}. {s.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted sm:hidden">
            Step {step + 1} of {STEPS.length}: {STEPS[step]!.title}
          </p>
        </nav>

        <form onSubmit={(e) => e.preventDefault()} noValidate className="relative mt-8" aria-busy={pending}>
          <Honeypot value={state.swzCheck} onChange={(v) => update("swzCheck", v)} />
          <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-28 text-[1.75rem] leading-tight text-ink outline-none sm:text-[2rem]">
            {["Where would you like to go?", "When, and who is travelling?", "How do you like to travel?", "How can we reach you?", "Check your trip"][step]}
          </h2>
          {formError && (
            <div className="mt-5">
              <FormAlert title={formError} />
            </div>
          )}

          {/* Step 1: route */}
          {step === 0 && (
            <div className="mt-6">
              <p className="text-muted">Add destinations in the order you want to visit them, and how many days to spend in each.</p>
              <ol className="mt-6 space-y-4">
                {state.legs.map((leg, index) => {
                  const destination = byId.get(leg.destinationId);
                  return (
                    <li key={leg.key} className="rounded-sm border border-line bg-surface p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Stop {index + 1}</p>
                        <div className="flex items-center gap-1">
                          <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => moveLeg(index, -1)} disabled={index === 0} aria-label={`Move stop ${index + 1} earlier`}>
                            <ArrowUp aria-hidden size={16} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => moveLeg(index, 1)} disabled={index === state.legs.length - 1} aria-label={`Move stop ${index + 1} later`}>
                            <ArrowDown aria-hidden size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm px-2 text-danger"
                            onClick={() => setState((s) => ({ ...s, legs: s.legs.filter((l) => l.key !== leg.key) }))}
                            disabled={state.legs.length === 1}
                            aria-label={`Remove stop ${index + 1}`}
                          >
                            <Trash2 aria-hidden size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <Field label="Destination" required error={errors[`legs.${index}.destinationId`]}>
                          {(p) => (
                            <select {...p} className="input" value={leg.destinationId} onChange={(e) => updateLeg(leg.key, { destinationId: e.target.value })} data-testid={`leg-${index}-destination`}>
                              <option value="">Choose a destination</option>
                              {destinations.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <Field label="Days" required error={errors[`legs.${index}.days`]}>
                          {(p) => <Stepper id={p.id} value={leg.days} min={1} max={LIMITS.maxDaysPerLeg} onChange={(v) => updateLeg(leg.key, { days: v })} label={`days at stop ${index + 1}`} />}
                        </Field>
                      </div>
                      {destination && (
                        <p className="mt-3 text-sm text-muted">
                          {destination.summary}
                          {destination.priceLabel && <span className="block text-ink-soft">{destination.priceLabel}</span>}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
              {errors.legs && <p className="field-error">{errors.legs}</p>}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setState((s) => ({ ...s, legs: [...s.legs, { key: newKey(), destinationId: "", days: 1 }] }))}
                  disabled={state.legs.length >= LIMITS.maxLegs}
                >
                  <Plus aria-hidden size={16} /> Add a destination
                </button>
                <p className="text-sm text-muted">
                  Total: <strong className="text-ink">{totalDays} day{totalDays === 1 ? "" : "s"}</strong>
                </p>
              </div>
            </div>
          )}

          {/* Step 2: dates & travellers */}
          {step === 1 && (
            <div className="mt-6 space-y-8">
              <fieldset>
                <legend className="field-label">Travel dates</legend>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
                  {(
                    [
                      ["exact", "I know my arrival date"],
                      ["month", "I only know the month"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex min-h-11 items-center gap-3">
                      <input type="radio" name="dateMode" value={value} checked={state.dateMode === value} onChange={() => update("dateMode", value)} className="h-5 w-5 accent-[var(--color-ink)]" />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="mt-4 max-w-xs">
                  {state.dateMode === "exact" ? (
                    <Field label="Arrival date" required error={errors.startDate}>
                      {(p) => <input {...p} type="date" className="input" min={today} value={state.startDate} onChange={(e) => update("startDate", e.target.value)} />}
                    </Field>
                  ) : (
                    <Field label="Travel month" required error={errors.travelMonth}>
                      {(p) => <input {...p} type="month" className="input" min={thisMonth} max={lastMonth} value={state.travelMonth} onChange={(e) => update("travelMonth", e.target.value)} />}
                    </Field>
                  )}
                </div>
              </fieldset>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Field label="Adults" required error={errors.adults} hint="Age 12 and over">
                  {(p) => <Stepper id={p.id} value={state.adults} min={1} max={LIMITS.maxAdults} onChange={(v) => update("adults", v)} label="adults" />}
                </Field>
                <Field label="Children" required error={errors.children} hint="Under 12">
                  {(p) => <Stepper id={p.id} value={state.children} min={0} max={LIMITS.maxChildren} onChange={(v) => update("children", v)} label="children" />}
                </Field>
              </div>
            </div>
          )}

          {/* Step 3: preferences */}
          {step === 2 && (
            <div className="mt-6 space-y-8">
              <fieldset>
                <legend className="field-label">Where would you like to stay?</legend>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ACCOMMODATION_OPTIONS.map((o) => (
                    <label key={o.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm border border-line bg-surface px-4 has-[:checked]:border-ink has-[:checked]:bg-paper-deep/50">
                      <input type="radio" name="accommodation" value={o.value} checked={state.accommodation === o.value} onChange={() => update("accommodation", o.value)} className="h-5 w-5 accent-[var(--color-ink)]" />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Transport" required error={errors.transport} className="max-w-sm">
                {(p) => (
                  <select {...p} className="input" value={state.transport} onChange={(e) => update("transport", e.target.value)}>
                    {TRANSPORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <fieldset>
                <legend className="field-label">
                  Interests <span className="font-normal text-muted">(optional)</span>
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((o) => {
                    const checked = state.interests.includes(o.value);
                    return (
                      <label key={o.value} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lake">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => update("interests", checked ? state.interests.filter((v) => v !== o.value) : [...state.interests, o.value])}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Field label="Approximate budget" error={errors.budget} hint="For example “₹60,000 for two”.">
                  {(p) => <input {...p} className="input" value={state.budget} onChange={(e) => update("budget", e.target.value)} />}
                </Field>
                <Field label="Promo code" error={errors.promoCode}>
                  {(p) => <input {...p} className="input uppercase" value={state.promoCode} onChange={(e) => update("promoCode", e.target.value.toUpperCase())} autoComplete="off" />}
                </Field>
              </div>
            </div>
          )}

          {/* Step 4: contact */}
          {step === 3 && (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Full name" required error={errors.name}>
                  {(p) => <input {...p} className="input" autoComplete="name" value={state.name} onChange={(e) => update("name", e.target.value)} />}
                </Field>
                <Field label="Email" required error={errors.email}>
                  {(p) => <input {...p} className="input" type="email" autoComplete="email" value={state.email} onChange={(e) => update("email", e.target.value)} />}
                </Field>
              </div>
              <Field label="Phone or WhatsApp number" required error={errors.phone} hint="Include your country code if you are outside India.">
                {(p) => <input {...p} className="input" type="tel" autoComplete="tel" value={state.phone} onChange={(e) => update("phone", e.target.value)} />}
              </Field>
              <Field label="Anything else we should know?" error={errors.message}>
                {(p) => <textarea {...p} className="input" rows={4} placeholder="Occasion, mobility needs, places you have already seen…" value={state.message} onChange={(e) => update("message", e.target.value)} />}
              </Field>
              <div>
                <label className="flex items-start gap-3 text-sm text-ink-soft">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-ink)]" checked={state.consent} onChange={(e) => update("consent", e.target.checked)} aria-invalid={Boolean(errors.consent)} />
                  <span>
                    I agree that my details will be used to plan and reply to this enquiry, as described in the <Link href="/privacy" className="link">privacy notice</Link>.
                  </span>
                </label>
                {errors.consent && <p className="field-error">{errors.consent}</p>}
              </div>
            </div>
          )}

          {/* Step 5: review */}
          {step === 4 && (
            <div className="mt-6 space-y-6">
              <dl className="divide-y divide-line rounded-sm border border-line bg-surface">
                {[
                  ["Route", state.legs.map((l) => `${legLabel(l)} (${l.days} day${l.days === 1 ? "" : "s"})`).join(" → "), 0],
                  ["Dates", datesText, 1],
                  ["Travellers", `${state.adults} adult${state.adults === 1 ? "" : "s"}${state.children ? `, ${state.children} child${state.children === 1 ? "" : "ren"}` : ""}`, 1],
                  ["Stay", accommodationLabel(state.accommodation), 2],
                  ["Transport", transportLabel(state.transport), 2],
                  ["Interests", state.interests.map(interestLabel).join(", ") || "—", 2],
                  ["Budget", state.budget || "—", 2],
                  ["Promo code", state.promoCode || "—", 2],
                  ["Contact", `${state.name} · ${state.email} · ${state.phone}`, 3],
                  ["Notes", state.message || "—", 3],
                ].map(([label, value, target]) => (
                  <div key={label as string} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr_auto] sm:items-baseline sm:gap-4">
                    <dt className="text-sm text-muted">{label}</dt>
                    <dd className="text-ink">{value}</dd>
                    <button type="button" className="link justify-self-start text-sm" onClick={() => goTo(target as number)}>
                      Edit<span className="sr-only"> {label}</span>
                    </button>
                  </div>
                ))}
              </dl>
              <div className="rounded-sm border border-line bg-surface p-5 lg:hidden">
                <EstimatePanel estimate={estimate} loading={estimating} error={estimateError} />
              </div>
              <p className="text-sm leading-relaxed text-muted">
                Sending this creates an enquiry, not a booking. Nothing is reserved and no payment is taken on this website.
              </p>
            </div>
          )}

          <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
            {step > 0 ? (
              <button type="button" className="btn btn-secondary" onClick={() => goTo(step - 1)} disabled={pending}>
                Back
              </button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                Continue
              </button>
            ) : (
              <button type="button" className="btn btn-accent" onClick={submit} disabled={pending}>
                {pending ? "Sending your trip…" : "Send my trip request"}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Summary */}
      <aside aria-label="Trip summary" className="hidden lg:block">
        <div className="sticky top-28 rounded-sm border border-line bg-surface p-6">
          <h2 className="font-sans text-xs font-semibold tracking-[0.14em] text-muted uppercase">Your trip</h2>
          <ol className="mt-4 space-y-2">
            {state.legs.map((leg, index) => (
              <li key={leg.key} className="flex justify-between gap-3 text-sm">
                <span className={leg.destinationId ? "text-ink" : "text-muted"}>
                  {index + 1}. {legLabel(leg)}
                </span>
                <span className="shrink-0 text-muted">
                  {leg.days} day{leg.days === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
            {totalDays} days · {state.adults + state.children} traveller{state.adults + state.children === 1 ? "" : "s"} · {datesText}
          </p>
          <div className="mt-5 border-t border-line pt-5">
            <EstimatePanel estimate={estimate} loading={estimating} error={estimateError} />
          </div>
        </div>
      </aside>
    </div>
  );
}
