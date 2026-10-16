"use client";

import { useState } from "react";
import type { DestinationInput } from "@/domain/admin-schemas";
import { slugify } from "@/domain/slug";
import type { ActionState } from "@/lib/action-state";
import { ActionForm, SubmitButton } from "./forms";
import { EditorSection, GalleryPicker, HeroPicker, Input, RowList, RulesEditor, type Errors, type MediaOption } from "./editor";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;


export function DestinationEditor({ id, version = "", initial, media, action }: { id: string | null; initial: DestinationInput; media: MediaOption[]; action: Action; version?: string }) {
  const [d, setD] = useState<DestinationInput>(initial);
  // After a save the page re-renders with the persisted record (new version): show exactly that.
  const [shownVersion, setShownVersion] = useState(version);
  if (version !== shownVersion) {
    setShownVersion(version);
    setD(initial);
  }
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const set = <K extends keyof DestinationInput>(key: K, value: DestinationInput[K]) => setD((s) => ({ ...s, [key]: value }));

  return (
    <ActionForm action={action}>
      {(state) => {
        const errors: Errors = state.status === "error" ? Object.fromEntries(Object.entries(state.fieldErrors ?? {}).map(([k, v]) => [k.replace(/^data\./, ""), v])) : {};
        return (
          <>
            <input type="hidden" name="payload" value={JSON.stringify({ id, data: d })} />
            <EditorSection title="Basics">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Name" required value={d.name} error={errors.name} onChange={(v) => setD((s) => ({ ...s, name: v, slug: slugTouched ? s.slug : slugify(v) }))} />
                <Input label="URL slug" required value={d.slug} error={errors.slug} hint={`/destinations/${d.slug || "…"}`} onChange={(v) => { setSlugTouched(true); set("slug", v); }} />
                <Input label="Region / district" value={d.region ?? ""} onChange={(v) => set("region", v)} />
                <Input label="Sort order" type="number" value={String(d.sortOrder ?? 0)} onChange={(v) => set("sortOrder", Number(v))} />
              </div>
              <Input label="Summary" required value={d.summary} error={errors.summary} onChange={(v) => set("summary", v)} />
              <Input label="Description" required multiline rows={6} value={d.description} error={errors.description} hint="Separate paragraphs with a blank line." onChange={(v) => set("description", v)} />
            </EditorSection>

            <EditorSection title="Travel guidance" description="Leave blank anything the business has not confirmed.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Best time to visit" value={d.bestSeason ?? ""} onChange={(v) => set("bestSeason", v)} />
                <Input label="Suggested stay" value={d.recommendedDuration ?? ""} placeholder="2–3 days" onChange={(v) => set("recommendedDuration", v)} />
              </div>
              <Input label="Travel notes" multiline rows={4} value={d.travelTips ?? ""} onChange={(v) => set("travelTips", v)} />
            </EditorSection>

            <EditorSection title="Highlights">
              <RowList
                items={d.attractions ?? []}
                onChange={(v) => set("attractions", v)}
                itemLabel="Highlight"
                addLabel="Add a highlight"
                create={() => ({ name: "", description: "" })}
                render={(a, update, i) => (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input label="Name" required value={a.name} error={errors[`attractions.${i}.name`]} onChange={(v) => update({ name: v })} />
                    <Input label="Description" value={a.description ?? ""} onChange={(v) => update({ description: v })} />
                  </div>
                )}
              />
            </EditorSection>

            <EditorSection title="Rates for custom trips" description="Used by the trip builder. With no active rate, visitors are asked to request a quote.">
              <RulesEditor rules={d.pricingRules ?? []} onChange={(v) => set("pricingRules", v)} errors={errors} path="pricingRules" allowPackageBasis={false} />
            </EditorSection>

            <EditorSection title="Images">
              <HeroPicker media={media} value={d.heroImageId ?? ""} onChange={(v) => set("heroImageId", v)} error={errors.heroImageId} />
              <GalleryPicker media={media} value={d.galleryIds ?? []} onChange={(v) => set("galleryIds", v)} />
            </EditorSection>

            <EditorSection title="Search engines">
              <Input label="SEO title" value={d.seoTitle ?? ""} error={errors.seoTitle} onChange={(v) => set("seoTitle", v)} />
              <Input label="SEO description" value={d.seoDescription ?? ""} error={errors.seoDescription} onChange={(v) => set("seoDescription", v)} />
            </EditorSection>

            <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur-sm sm:-mx-8 sm:px-8">
              <SubmitButton>{id ? "Save changes" : "Create destination"}</SubmitButton>
              {state.status === "error" && <span className="text-sm text-danger">{state.message}</span>}
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
