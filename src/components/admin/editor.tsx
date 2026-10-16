"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { BASIS_LABELS } from "@/domain/pricing";
import { PRICING_BASES, type PricingRuleInput } from "@/domain/admin-schemas";

export interface MediaOption {
  id: string;
  path: string;
  alt: string;
}

/** Error lookup for nested paths such as "pricingRules.0.amount". */
export type Errors = Record<string, string>;
export const errorAt = (errors: Errors, path: string) => errors[path];

export function Input({ label, value, onChange, error, hint, type = "text", required, multiline, rows = 4, placeholder, className = "" }: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const props = { id, value, placeholder, "aria-invalid": Boolean(error), "aria-describedby": error || hint ? `${id}-d` : undefined, className: "input" };
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {multiline ? <textarea {...props} rows={rows} onChange={(e) => onChange(e.target.value)} /> : <input {...props} type={type} onChange={(e) => onChange(e.target.value)} />}
      {(error || hint) && <p id={`${id}-d`} className={error ? "field-error" : "field-hint"}>{error ?? hint}</p>}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Ordered list of rows with move/remove controls and an add button. */
export function RowList<T>({ items, onChange, render, create, addLabel, empty, max = 50, itemLabel }: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
  create: () => T;
  addLabel: string;
  empty?: string;
  max?: number;
  itemLabel: string;
}) {
  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  return (
    <div>
      {items.length === 0 && empty && <p className="mb-3 text-sm text-muted">{empty}</p>}
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={index} className="rounded-sm border border-line bg-paper/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">{itemLabel} {index + 1}</span>
              <span className="flex gap-1">
                <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${itemLabel} ${index + 1} up`}><ArrowUp aria-hidden size={15} /></button>
                <button type="button" className="btn btn-ghost btn-sm px-2" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${itemLabel} ${index + 1} down`}><ArrowDown aria-hidden size={15} /></button>
                <button type="button" className="btn btn-ghost btn-sm px-2 text-danger" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={`Remove ${itemLabel} ${index + 1}`}><Trash2 aria-hidden size={15} /></button>
              </span>
            </div>
            {render(item, (patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it))), index)}
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => onChange([...items, create()])} disabled={items.length >= max}>
        <Plus aria-hidden size={15} /> {addLabel}
      </button>
    </div>
  );
}

export function StringList({ items, onChange, label, errors, path, addLabel }: { items: string[]; onChange: (v: string[]) => void; label: string; errors: Errors; path: string; addLabel: string }) {
  return (
    <RowList
      items={items}
      onChange={onChange}
      itemLabel={label}
      addLabel={addLabel}
      create={() => ""}
      render={(item, _update, index) => (
        <Input label={label} required value={item} error={errors[`${path}.${index}`]} onChange={(v) => onChange(items.map((x, i) => (i === index ? v : x)))} />
      )}
    />
  );
}

export function HeroPicker({ media, value, onChange, error }: { media: MediaOption[]; value: string; onChange: (id: string) => void; error?: string }) {
  return (
    <fieldset>
      <legend className="field-label">Main image</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        <label className="flex aspect-[4/3] cursor-pointer items-center justify-center rounded-xs border border-dashed border-line-strong text-xs text-muted has-[:checked]:ring-2 has-[:checked]:ring-ink">
          <input type="radio" className="sr-only" checked={!value} onChange={() => onChange("")} />
          None
        </label>
        {media.map((m) => (
          <label key={m.id} className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-xs has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:checked]:ring-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lake">
            <input type="radio" className="sr-only" checked={value === m.id} onChange={() => onChange(m.id)} aria-label={m.alt} />
            <Image src={m.path} alt="" fill sizes="120px" className="object-cover" />
          </label>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}

export function GalleryPicker({ media, value, onChange }: { media: MediaOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <fieldset>
      <legend className="field-label">Gallery <span className="font-normal text-muted">(select in display order)</span></legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        {media.map((m) => {
          const index = value.indexOf(m.id);
          return (
            <label key={m.id} className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-xs has-[:checked]:ring-2 has-[:checked]:ring-ink has-[:checked]:ring-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lake">
              <input type="checkbox" className="sr-only" checked={index >= 0} onChange={() => onChange(index >= 0 ? value.filter((id) => id !== m.id) : [...value, m.id])} aria-label={m.alt} />
              <Image src={m.path} alt="" fill sizes="120px" className="object-cover" />
              {index >= 0 && <span className="absolute top-1 left-1 rounded-full bg-ink px-1.5 text-xs font-semibold text-paper">{index + 1}</span>}
            </label>
          );
        })}
      </div>
      <p className="field-hint">New photos are added by a developer to /public/images and the image manifest (see docs/OPERATIONS.md).</p>
    </fieldset>
  );
}

export const emptyRule = (): PricingRuleInput => ({
  label: "",
  basis: "PER_PERSON_PER_DAY",
  amount: "",
  childAmount: "",
  includedTravellers: "",
  seasonStart: "",
  seasonEnd: "",
  validFrom: "",
  validTo: "",
  active: false,
  notes: "",
});

export function RulesEditor({ rules, onChange, errors, path, allowPackageBasis }: { rules: PricingRuleInput[]; onChange: (r: PricingRuleInput[]) => void; errors: Errors; path: string; allowPackageBasis: boolean }) {
  const bases = PRICING_BASES.filter((b) => allowPackageBasis || b !== "PER_PACKAGE");
  return (
    <RowList
      items={rules}
      onChange={onChange}
      itemLabel="Rate"
      addLabel="Add a rate"
      create={emptyRule}
      empty="No rates. Visitors will be asked to request a quote."
      render={(rule, update, i) => {
        const e = (field: string) => errors[`${path}.${i}.${field}`];
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input label="Label" required value={rule.label} onChange={(v) => update({ label: v })} error={e("label")} placeholder="Standard rate" className="lg:col-span-2" />
            <div className="lg:col-span-2">
              <label className="field-label" htmlFor={`${path}-${i}-basis`}>Basis</label>
              <select id={`${path}-${i}-basis`} className="input" value={rule.basis} onChange={(ev) => update({ basis: ev.target.value as PricingRuleInput["basis"] })}>
                {bases.map((b) => <option key={b} value={b}>{BASIS_LABELS[b]}</option>)}
              </select>
              {e("basis") && <p className="field-error">{e("basis")}</p>}
            </div>
            <Input label="Amount (₹)" required value={String(rule.amount ?? "")} onChange={(v) => update({ amount: v })} error={e("amount")} />
            <Input label="Child amount (₹)" value={String(rule.childAmount ?? "")} onChange={(v) => update({ childAmount: v })} error={e("childAmount")} hint="Leave blank if not published" />
            {rule.basis === "PER_PACKAGE" && <Input label="Travellers covered" required value={String(rule.includedTravellers ?? "")} onChange={(v) => update({ includedTravellers: v })} error={e("includedTravellers")} />}
            <Input label="Season from (MM-DD)" value={String(rule.seasonStart ?? "")} onChange={(v) => update({ seasonStart: v })} error={e("seasonStart")} />
            <Input label="Season to (MM-DD)" value={String(rule.seasonEnd ?? "")} onChange={(v) => update({ seasonEnd: v })} error={e("seasonEnd")} />
            <Input label="Valid from" type="date" value={String(rule.validFrom ?? "")} onChange={(v) => update({ validFrom: v })} error={e("validFrom")} />
            <Input label="Valid to" type="date" value={String(rule.validTo ?? "")} onChange={(v) => update({ validTo: v })} error={e("validTo")} />
            <Input label="Internal notes" value={String(rule.notes ?? "")} onChange={(v) => update({ notes: v })} error={e("notes")} className="sm:col-span-2 lg:col-span-4" />
            <div className="sm:col-span-2 lg:col-span-4">
              <Checkbox label="Active — use this rate on the website and in estimates" checked={rule.active} onChange={(v) => update({ active: v })} hint="Only activate a rate once its amount and basis are confirmed." />
            </div>
          </div>
        );
      }}
    />
  );
}

export function EditorSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[14rem_1fr] lg:gap-8">
      <div>
        <h2 className="font-sans text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
