"use client";

import { useMemo, useState } from "react";
import type { PackageInput } from "@/domain/admin-schemas";
import { slugify } from "@/domain/slug";
import { BASIS_LABELS } from "@/domain/pricing";
import { PRICING_BASES } from "@/domain/admin-schemas";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton } from "./forms";
import { Checkbox, EditorSection, GalleryPicker, HeroPicker, Input, RowList, RulesEditor, StringList, type Errors, type MediaOption } from "./editor";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;


function stripPrefix(errors: Record<string, string> | undefined): Errors {
  return Object.fromEntries(Object.entries(errors ?? {}).map(([k, v]) => [k.replace(/^data\./, ""), v]));
}

export function PackageEditor({ id, version = "", initial, media, destinations, action }: { id: string | null; initial: PackageInput; media: MediaOption[]; destinations: { id: string; name: string; status: string }[]; action: Action; version?: string }) {
  const [p, setP] = useState<PackageInput>(initial);
  // After a save the page re-renders with the persisted record (new version): show exactly that.
  const [shownVersion, setShownVersion] = useState(version);
  if (version !== shownVersion) {
    setShownVersion(version);
    setP(initial);
  }
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const set = <K extends keyof PackageInput>(key: K, value: PackageInput[K]) => setP((s) => ({ ...s, [key]: value }));
  const routeDays = useMemo(() => (p.route ?? []).reduce((n, r) => n + Number(r.days || 0), 0), [p.route]);

  return (
    <ActionForm action={action}>
      {(state) => {
        const errors = state.status === "error" ? stripPrefix(state.fieldErrors) : {};
        return (
          <>
            <input type="hidden" name="payload" value={JSON.stringify({ id, data: p })} />
            <EditorSection title="Basics" description="What visitors see first.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Title" required value={p.title} error={errors.title} onChange={(v) => setP((s) => ({ ...s, title: v, slug: slugTouched ? s.slug : slugify(v) }))} />
                <Input label="URL slug" required value={p.slug} error={errors.slug} hint={`/packages/${p.slug || "…"}`} onChange={(v) => { setSlugTouched(true); set("slug", v); }} />
                <Input label="Category" value={p.category ?? ""} error={errors.category} placeholder="Honeymoon, Family, Adventure…" onChange={(v) => set("category", v)} />
                <Input label="Suited to" value={p.idealFor ?? ""} error={errors.idealFor} placeholder="2 adults" onChange={(v) => set("idealFor", v)} />
                <Input label="Days" required type="number" value={String(p.durationDays)} error={errors.durationDays} onChange={(v) => set("durationDays", Number(v))} />
                <Input label="Nights" required type="number" value={String(p.durationNights)} error={errors.durationNights} onChange={(v) => set("durationNights", Number(v))} />
              </div>
              <Input label="Summary" required value={p.summary} error={errors.summary} hint="One or two sentences for cards and search results." onChange={(v) => set("summary", v)} />
              <Input label="Description" required multiline rows={6} value={p.description} error={errors.description} hint="Separate paragraphs with a blank line." onChange={(v) => set("description", v)} />
              <div className="flex flex-wrap gap-6">
                <Checkbox label="Featured on the home page" checked={Boolean(p.featured)} onChange={(v) => set("featured", v)} />
                <Input label="Sort order" type="number" value={String(p.sortOrder ?? 0)} onChange={(v) => set("sortOrder", Number(v))} className="w-32" />
              </div>
            </EditorSection>

            <EditorSection title="Route" description={`Destinations in travel order. Currently ${routeDays} of ${p.durationDays} days.`}>
              {errors.route && <p className="field-error">{errors.route}</p>}
              <RowList
                items={p.route ?? []}
                onChange={(v) => set("route", v)}
                itemLabel="Stop"
                addLabel="Add a stop"
                create={() => ({ destinationId: "", days: 1 })}
                render={(stop, update, i) => (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
                    <div>
                      <label className="field-label" htmlFor={`route-${i}`}>Destination</label>
                      <select id={`route-${i}`} className="input" value={stop.destinationId} onChange={(e) => update({ destinationId: e.target.value })}>
                        <option value="">Choose…</option>
                        {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}{d.status !== "PUBLISHED" ? ` (${d.status.toLowerCase()})` : ""}</option>)}
                      </select>
                      {errors[`route.${i}.destinationId`] && <p className="field-error">{errors[`route.${i}.destinationId`]}</p>}
                    </div>
                    <Input label="Days" required type="number" value={String(stop.days)} error={errors[`route.${i}.days`]} onChange={(v) => update({ days: Number(v) })} />
                  </div>
                )}
              />
            </EditorSection>

            <EditorSection title="Day by day" description="Optional detailed itinerary. Days are numbered in this order.">
              <RowList
                items={p.itinerary ?? []}
                onChange={(v) => set("itinerary", v)}
                itemLabel="Day"
                addLabel="Add a day"
                create={() => ({ title: "", description: "", overnight: "" })}
                render={(day, update, i) => (
                  <div className="grid gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input label="Title" required value={day.title} error={errors[`itinerary.${i}.title`]} onChange={(v) => update({ title: v })} />
                      <Input label="Overnight at" value={day.overnight ?? ""} onChange={(v) => update({ overnight: v })} />
                    </div>
                    <Input label="Description" required multiline rows={3} value={day.description} error={errors[`itinerary.${i}.description`]} onChange={(v) => update({ description: v })} />
                  </div>
                )}
              />
            </EditorSection>

            <EditorSection title="Inclusions" description="Only list what the business has confirmed.">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <p className="field-label">Included</p>
                  <StringList items={p.included ?? []} onChange={(v) => set("included", v)} label="Included item" addLabel="Add included item" errors={errors} path="included" />
                </div>
                <div>
                  <p className="field-label">Not included</p>
                  <StringList items={p.excluded ?? []} onChange={(v) => set("excluded", v)} label="Excluded item" addLabel="Add excluded item" errors={errors} path="excluded" />
                </div>
              </div>
            </EditorSection>

            <EditorSection title="Pricing" description="Every rate states its basis. Inactive rates are kept but never shown or used.">
              <RulesEditor rules={p.pricingRules ?? []} onChange={(v) => set("pricingRules", v)} errors={errors} path="pricingRules" allowPackageBasis />
            </EditorSection>

            <EditorSection title="Add-ons" description="Optional extras visitors can tick when enquiring.">
              <RowList
                items={p.addons ?? []}
                onChange={(v) => set("addons", v)}
                itemLabel="Add-on"
                addLabel="Add an add-on"
                create={() => ({ name: "", description: "", basis: "PER_PERSON" as const, amount: "", active: true })}
                render={(addon, update, i) => (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input label="Name" required value={addon.name} error={errors[`addons.${i}.name`]} onChange={(v) => update({ name: v })} className="lg:col-span-2" />
                    <div>
                      <label className="field-label" htmlFor={`addon-basis-${i}`}>Basis</label>
                      <select id={`addon-basis-${i}`} className="input" value={addon.basis} onChange={(e) => update({ basis: e.target.value as typeof addon.basis })}>
                        {PRICING_BASES.filter((b) => b !== "PER_PACKAGE").map((b) => <option key={b} value={b}>{BASIS_LABELS[b]}</option>)}
                      </select>
                    </div>
                    <Input label="Amount (₹)" required value={String(addon.amount ?? "")} error={errors[`addons.${i}.amount`]} onChange={(v) => update({ amount: v })} />
                    <Input label="Description" value={addon.description ?? ""} onChange={(v) => update({ description: v })} className="sm:col-span-2 lg:col-span-3" />
                    <div className="flex items-end pb-2"><Checkbox label="Offered" checked={addon.active} onChange={(v) => update({ active: v })} /></div>
                  </div>
                )}
              />
            </EditorSection>

            <EditorSection title="Practical details" description="Shown on the package page when filled in.">
              <Input label="Accommodation" multiline rows={3} value={p.accommodationInfo ?? ""} onChange={(v) => set("accommodationInfo", v)} />
              <Input label="Transport" multiline rows={3} value={p.transportInfo ?? ""} onChange={(v) => set("transportInfo", v)} />
              <Input label="Availability notes" multiline rows={2} value={p.availabilityNotes ?? ""} onChange={(v) => set("availabilityNotes", v)} />
              <Input label="Cancellation policy" multiline rows={3} value={p.cancellationPolicy ?? ""} hint="Only publish a policy the business has defined." onChange={(v) => set("cancellationPolicy", v)} />
            </EditorSection>

            <EditorSection title="Images">
              <HeroPicker media={media} value={p.heroImageId ?? ""} onChange={(v) => set("heroImageId", v)} error={errors.heroImageId} />
              <GalleryPicker media={media} value={p.galleryIds ?? []} onChange={(v) => set("galleryIds", v)} />
            </EditorSection>

            <EditorSection title="Search engines">
              <Input label="SEO title" value={p.seoTitle ?? ""} error={errors.seoTitle} hint="Defaults to the package title. Up to 70 characters." onChange={(v) => set("seoTitle", v)} />
              <Input label="SEO description" value={p.seoDescription ?? ""} error={errors.seoDescription} hint="Defaults to the summary. Up to 160 characters." onChange={(v) => set("seoDescription", v)} />
            </EditorSection>

            <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-sm sm:-mx-8 sm:px-8">
              <SubmitButton>{id ? "Save changes" : "Create package"}</SubmitButton>
              {state.status === "error" && <span className="text-sm text-danger">{state.message}</span>}
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
