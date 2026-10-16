import { ActionForm, ConfirmAction, SubmitButton, TextField } from "@/components/admin/forms";
import { Card, PageHeader, PublicationBadge } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";
import { deleteFaqAction, saveFaqAction } from "./actions";

export const metadata = { title: "FAQs" };

type Row = Awaited<ReturnType<typeof prisma.faq.findMany>>[number];

function Fields({ f }: { f?: Row }) {
  return (
    <div className="grid gap-4">
      {f && <input type="hidden" name="id" value={f.id} />}
      <TextField label="Question" name="question" required defaultValue={f?.question} />
      <TextField label="Answer" name="answer" required multiline rows={4} defaultValue={f?.answer} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`faq-${f?.id ?? "new"}-status`}>Visibility</label>
          <select id={`faq-${f?.id ?? "new"}-status`} name="status" className="input" defaultValue={f?.status ?? "DRAFT"}>
            <option value="DRAFT">Draft (hidden)</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <TextField label="Sort order" name="sortOrder" type="number" defaultValue={f?.sortOrder ?? 0} />
      </div>
    </div>
  );
}

export default async function FaqsPage() {
  await requireStaffPage();
  const rows = await prisma.faq.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return (
    <>
      <PageHeader title="FAQs" description="Published questions appear on the home page, in this order." />
      <div className="space-y-4">
        {rows.map((f) => (
          <details key={f.id} data-record-id={f.id} className="rounded-sm border border-line bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
              <span className="font-medium text-ink">{f.question}</span>
              <PublicationBadge status={f.status} />
            </summary>
            <div className="border-t border-line p-5">
              <ActionForm action={saveFaqAction} version={f.updatedAt.toISOString()}>
                <Fields f={f} />
                <div className="mt-4"><SubmitButton>Save</SubmitButton></div>
              </ActionForm>
              <div className="mt-4"><ConfirmAction action={deleteFaqAction} fields={{ id: f.id }} label="Delete" confirmLabel="Delete" warning="Delete this FAQ permanently?" /></div>
            </div>
          </details>
        ))}
        <Card title="Add a question">
          <ActionForm action={saveFaqAction} resetOnSuccess>
            <Fields />
            <div className="mt-4"><SubmitButton>Add FAQ</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
