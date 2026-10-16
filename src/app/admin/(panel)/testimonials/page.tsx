import { ActionForm, ConfirmAction, SubmitButton, TextField } from "@/components/admin/forms";
import { Card, PageHeader, PublicationBadge } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";
import { deleteTestimonialAction, saveTestimonialAction } from "./actions";

export const metadata = { title: "Testimonials" };

type Row = Awaited<ReturnType<typeof prisma.testimonial.findMany>>[number];

function Fields({ t }: { t?: Row }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {t && <input type="hidden" name="id" value={t.id} />}
      <TextField label="Guest name" name="authorName" required defaultValue={t?.authorName} />
      <TextField label="Location" name="location" defaultValue={t?.location} placeholder="Pune" />
      <div className="sm:col-span-2"><TextField label="Review" name="quote" required multiline rows={3} defaultValue={t?.quote} /></div>
      <TextField label="Rating (1–5)" name="rating" type="number" defaultValue={t?.rating ?? ""} />
      <TextField label="Source" name="source" defaultValue={t?.source} hint="Where the review came from (e.g. WhatsApp message, Google review)." />
      <div>
        <label className="field-label" htmlFor={`t-${t?.id ?? "new"}-status`}>Visibility</label>
        <select id={`t-${t?.id ?? "new"}-status`} name="status" className="input" defaultValue={t?.status ?? "DRAFT"}>
          <option value="DRAFT">Draft (hidden)</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
      <TextField label="Sort order" name="sortOrder" type="number" defaultValue={t?.sortOrder ?? 0} />
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input type="checkbox" name="consentConfirmed" defaultChecked={t?.consentConfirmed ?? false} className="mt-0.5 h-5 w-5 accent-[var(--color-ink)]" />
        <span>I confirm this is a genuine review from a real guest, and they agreed to it being published.</span>
      </label>
    </div>
  );
}

export default async function TestimonialsPage() {
  await requireStaffPage();
  const rows = await prisma.testimonial.findMany({ orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }] });
  return (
    <>
      <PageHeader title="Testimonials" description="Only genuine reviews with the guest's permission can be published. The database enforces this." />
      <div className="space-y-4">
        {rows.map((t) => (
          <details key={t.id} data-record-id={t.id} className="rounded-sm border border-line bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
              <span><span className="font-medium text-ink">{t.authorName}</span> <span className="text-sm text-muted">— “{t.quote.slice(0, 60)}{t.quote.length > 60 ? "…" : ""}”</span></span>
              <span className="flex gap-2">{!t.consentConfirmed && <span className="text-xs text-warning">Not verified</span>}<PublicationBadge status={t.status} /></span>
            </summary>
            <div className="border-t border-line p-5">
              {t.source && <p className="mb-4 text-sm text-muted">Source: {t.source}</p>}
              <ActionForm action={saveTestimonialAction} version={t.updatedAt.toISOString()}>
                <Fields t={t} />
                <div className="mt-4"><SubmitButton>Save</SubmitButton></div>
              </ActionForm>
              <div className="mt-4"><ConfirmAction action={deleteTestimonialAction} fields={{ id: t.id }} label="Delete" confirmLabel="Delete" warning="Delete this testimonial permanently?" /></div>
            </div>
          </details>
        ))}
        <Card title="Add a testimonial">
          <ActionForm action={saveTestimonialAction} resetOnSuccess>
            <Fields />
            <div className="mt-4"><SubmitButton>Add testimonial</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
