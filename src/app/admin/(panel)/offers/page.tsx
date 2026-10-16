import { formatINR, paiseToRupeeInput } from "@/domain/money";
import { ActionForm, ConfirmAction, SubmitButton, TextField } from "@/components/admin/forms";
import { Badge, Card, EmptyState, PageHeader, PublicationBadge } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";
import { deleteOfferAction, saveOfferAction, savePromoAction } from "./actions";

export const metadata = { title: "Offers & promo codes" };

const istDate = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : "");

type OfferRow = Awaited<ReturnType<typeof prisma.offer.findMany>>[number];
type PromoRow = Awaited<ReturnType<typeof prisma.promoCode.findMany>>[number];

function OfferFields({ offer, packages, promos }: { offer?: OfferRow; packages: { id: string; title: string }[]; promos: { id: string; code: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {offer && <input type="hidden" name="id" value={offer.id} />}
      <TextField label="Title" name="title" required defaultValue={offer?.title} />
      <TextField label="Highlight label" name="discountLabel" defaultValue={offer?.discountLabel} placeholder="10% off" />
      <div className="sm:col-span-2"><TextField label="Description" name="description" required multiline rows={3} defaultValue={offer?.description} /></div>
      <div>
        <label className="field-label" htmlFor={`offer-${offer?.id ?? "new"}-package`}>Linked package <span className="font-normal text-muted">(optional)</span></label>
        <select id={`offer-${offer?.id ?? "new"}-package`} name="packageId" className="input" defaultValue={offer?.packageId ?? ""}>
          <option value="">None — links to the trip builder</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor={`offer-${offer?.id ?? "new"}-promo`}>Promo code to show <span className="font-normal text-muted">(optional)</span></label>
        <select id={`offer-${offer?.id ?? "new"}-promo`} name="promoCodeId" className="input" defaultValue={offer?.promoCodeId ?? ""}>
          <option value="">None</option>
          {promos.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
        </select>
      </div>
      <TextField label="Starts" name="validFrom" type="date" defaultValue={istDate(offer?.validFrom ?? null)} />
      <TextField label="Ends" name="validTo" type="date" defaultValue={istDate(offer?.validTo ?? null)} />
      <div>
        <label className="field-label" htmlFor={`offer-${offer?.id ?? "new"}-status`}>Visibility</label>
        <select id={`offer-${offer?.id ?? "new"}-status`} name="status" className="input" defaultValue={offer?.status ?? "DRAFT"}>
          <option value="DRAFT">Draft (hidden)</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
      <TextField label="Sort order" name="sortOrder" type="number" defaultValue={offer?.sortOrder ?? 0} />
    </div>
  );
}

function PromoFields({ promo }: { promo?: PromoRow }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {promo && <input type="hidden" name="id" value={promo.id} />}
      <TextField label="Code" name="code" required defaultValue={promo?.code} placeholder="SPRING10" />
      <div>
        <label className="field-label" htmlFor={`promo-${promo?.id ?? "new"}-type`}>Type</label>
        <select id={`promo-${promo?.id ?? "new"}-type`} name="discountType" className="input" defaultValue={promo?.discountType ?? "PERCENT"}>
          <option value="PERCENT">Percentage</option>
          <option value="FIXED">Fixed amount (₹)</option>
        </select>
      </div>
      <TextField label="Value" name="value" required defaultValue={promo ? (promo.discountType === "PERCENT" ? promo.value : paiseToRupeeInput(promo.value)) : ""} hint="Percent or rupees" />
      <TextField label="Minimum trip value (₹)" name="minSubtotal" defaultValue={promo?.minSubtotalPaise != null ? paiseToRupeeInput(promo.minSubtotalPaise) : ""} />
      <TextField label="Maximum discount (₹)" name="maxDiscount" defaultValue={promo?.maxDiscountPaise != null ? paiseToRupeeInput(promo.maxDiscountPaise) : ""} />
      <TextField label="Valid from" name="validFrom" type="date" defaultValue={istDate(promo?.validFrom ?? null)} />
      <TextField label="Valid to" name="validTo" type="date" defaultValue={istDate(promo?.validTo ?? null)} />
      <TextField label="Internal description" name="description" defaultValue={promo?.description} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={promo?.active ?? true} className="h-5 w-5 accent-[var(--color-ink)]" /> Active</label>
    </div>
  );
}

export default async function OffersPage() {
  await requireStaffPage();
  const [offers, promos, packages] = await Promise.all([
    prisma.offer.findMany({ orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }] }),
    prisma.promoCode.findMany({ orderBy: { code: "asc" } }),
    prisma.package.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);
  const promoOptions = promos.map((p) => ({ id: p.id, code: p.code }));

  return (
    <>
      <PageHeader title="Offers & promo codes" description="Published offers appear on the home page while they are valid. Promo codes are checked on the server when estimates are calculated." />

      <h2 className="mb-4 font-display text-xl">Offers</h2>
      <div className="space-y-4">
        {offers.length === 0 && <EmptyState title="No offers">The “Seasonal offers” section stays hidden on the website until an offer is published.</EmptyState>}
        {offers.map((offer) => (
          <details key={offer.id} data-record-id={offer.id} className="rounded-sm border border-line bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
              <span className="font-medium text-ink">{offer.title}</span>
              <PublicationBadge status={offer.status} />
            </summary>
            <div className="border-t border-line p-5">
              <ActionForm action={saveOfferAction} version={offer.updatedAt.toISOString()}>
                <OfferFields offer={offer} packages={packages} promos={promoOptions} />
                <div className="mt-4"><SubmitButton>Save offer</SubmitButton></div>
              </ActionForm>
              <div className="mt-4"><ConfirmAction action={deleteOfferAction} fields={{ id: offer.id }} label="Delete offer" confirmLabel="Delete" warning="Delete this offer permanently?" /></div>
            </div>
          </details>
        ))}
        <Card title="New offer">
          <ActionForm action={saveOfferAction} resetOnSuccess>
            <OfferFields packages={packages} promos={promoOptions} />
            <div className="mt-4"><SubmitButton>Create offer</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>

      <h2 className="mt-12 mb-4 font-display text-xl">Promo codes</h2>
      <div className="space-y-4">
        {promos.map((promo) => (
          <details key={promo.id} data-record-id={promo.id} className="rounded-sm border border-line bg-surface">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
              <span className="font-mono font-semibold text-ink">{promo.code}</span>
              <span className="flex items-center gap-2 text-sm text-muted">
                {promo.discountType === "PERCENT" ? `${promo.value}% off` : `${formatINR(promo.value)} off`}
                <Badge tone={promo.active ? "success" : "neutral"}>{promo.active ? "Active" : "Inactive"}</Badge>
              </span>
            </summary>
            <div className="border-t border-line p-5">
              <ActionForm action={savePromoAction} version={promo.updatedAt.toISOString()}>
                <PromoFields promo={promo} />
                <div className="mt-4"><SubmitButton>Save promo code</SubmitButton></div>
              </ActionForm>
            </div>
          </details>
        ))}
        <Card title="New promo code">
          <ActionForm action={savePromoAction} resetOnSuccess>
            <PromoFields />
            <div className="mt-4"><SubmitButton>Create promo code</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
