"use client";

import { useRouter } from "next/navigation";
import { createContext, startTransition, useActionState, useContext, useEffect, useId, useState } from "react";
import { IDLE, type ActionState } from "@/lib/action-state";
import { toast } from "./Toaster";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Server-side field errors of the enclosing ActionForm, keyed by input name. */
const FieldErrorsContext = createContext<Record<string, string>>({});
/** Whether the enclosing ActionForm is submitting. */
const PendingContext = createContext(false);

export function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  const problems = state.status === "error" ? [...new Set(Object.values(state.fieldErrors ?? {}))] : [];
  return (
    <div role={state.status === "error" ? "alert" : "status"} className={`rounded-sm px-3 py-2 text-sm ${state.status === "error" ? "bg-danger-soft text-ink" : "bg-success-soft text-ink"}`}>
      <p>{state.message}</p>
      {problems.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A form bound to an admin server action, with inline success/error feedback.
 * `version` identifies the saved record (e.g. its updatedAt): when it changes after a save, the
 * inputs remount with the persisted values while the confirmation message stays visible.
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  version = "",
}: {
  action: Action;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  version?: string;
}) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(action, IDLE);

  // Submitted through onSubmit rather than <form action>: React resets uncontrolled inputs after a
  // form action completes, which would wipe what the user typed when the server rejects it.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return; // ignore double submits
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.status !== "idle") toast({ tone: state.status === "success" ? "success" : "error", message: state.message });
    if (state.status === "success") {
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- remount form to clear inputs after a successful submit
      if (resetOnSuccess) setFormKey((k) => k + 1);
    }
  }, [state, router, resetOnSuccess]);

  return (
    <FieldErrorsContext value={state.status === "error" ? (state.fieldErrors ?? {}) : {}}>
      <PendingContext value={pending}>
        <form key={`${formKey}:${version}`} onSubmit={onSubmit} className={className} aria-busy={pending}>
          {typeof children === "function" ? children(state) : children}
          {/* Hidden while a new submission is in flight, so an old message is never mistaken for the new result. */}
          <div className="mt-3 empty:hidden">{!pending && <ActionMessage state={state} />}</div>
        </form>
      </PendingContext>
    </FieldErrorsContext>
  );
}

export function SubmitButton({ children, variant = "primary", className = "", name, value }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger" | "accent"; className?: string; name?: string; value?: string }) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" name={name} value={value} className={`btn btn-sm btn-${variant} ${className}`} disabled={pending}>
      {pending ? "Saving…" : children}
    </button>
  );
}

/** Destructive action with an inline confirmation step (no browser dialogs). */
export function ConfirmAction({ action, fields, label, confirmLabel, warning }: { action: Action; fields: Record<string, string>; label: string; confirmLabel: string; warning: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn btn-sm btn-secondary text-danger" onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <ActionForm action={action} className="rounded-sm border border-danger/30 bg-danger-soft p-3">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <p className="text-sm text-ink">{warning}</p>
      <div className="mt-3 flex gap-2">
        <SubmitButton variant="danger">{confirmLabel}</SubmitButton>
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </div>
    </ActionForm>
  );
}

export function TextField({
  label,
  name,
  defaultValue,
  error,
  hint,
  type = "text",
  required,
  multiline,
  rows = 4,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  error?: string;
  hint?: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  const serverErrors = useContext(FieldErrorsContext);
  error ??= serverErrors[name];
  const common = { id, name, required, placeholder, "aria-invalid": Boolean(error), "aria-describedby": error || hint ? `${id}-d` : undefined, className: "input" };
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {multiline ? <textarea {...common} rows={rows} defaultValue={defaultValue ?? ""} /> : <input {...common} type={type} defaultValue={defaultValue ?? ""} />}
      {(error || hint) && (
        <p id={`${id}-d`} className={error ? "field-error" : "field-hint"}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
