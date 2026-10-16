import { notFound } from "next/navigation";
import { formatDateTime, formatIsoDate, formatIsoMonth, utcDateToIsoDate } from "@/domain/dates";
import { allowedTransitions, STATUS_LABELS } from "@/domain/enquiry-status";
import { formatINR } from "@/domain/money";
import type { Estimate } from "@/domain/pricing";
import { accommodationLabel, interestLabel, transportLabel } from "@/domain/trip-options";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/forms";
import { Badge, Card, EmailStatusBadge, EnquiryStatusBadge, PageHeader } from "@/components/admin/ui";
import { hasRole, requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";
import { addNoteAction, archiveAction, cancelEmailAction, deleteEnquiryAction, retryEmailAction, updateHandlingAction, updateStatusAction } from "../actions";

export const metadata = { title: "Enquiry" };

const TYPES = { CONTACT: "Contact enquiry", PACKAGE: "Package enquiry", CUSTOM_TRIP: "Custom trip request" } as const;
const KIND_LABELS = {
  INTERNAL_NOTIFICATION: "Notification to business inbox",
  CUSTOMER_ACKNOWLEDGEMENT: "Acknowledgement to customer",
  PASSWORD_RESET: "Password reset",
  DELIVERY_FAILURE_ALERT: "Delivery failure alert",
  TEST: "Test email",
} as const;

/** IST "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
function toIstInput(date: Date | null): string {
  if (!date) return "";
  return new Date(date.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 16);
}

export default async function EnquiryDetailPage({ params }: PageProps<"/admin/enquiries/[id]">) {
  const { id } = await params;
  const user = await requireStaffPage("STAFF", `/admin/enquiries/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [e, staff] = await Promise.all([
    prisma.enquiry.findUnique({
      where: { id },
      include: {
        package: { select: { title: true, slug: true } },
        destinations: { orderBy: { position: "asc" } },
        notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
        statusHistory: { orderBy: { createdAt: "desc" }, include: { changedBy: { select: { name: true } } } },
        emails: { orderBy: { createdAt: "asc" }, include: { attemptLog: { orderBy: { attemptNumber: "desc" }, take: 5 } } },
        assignee: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!e) notFound();

  const snapshot = e.snapshot as { estimate?: Estimate | null; addons?: { name: string }[] } | null;
  const estimate = snapshot?.estimate ?? null;
  const transitions = allowedTransitions(e.status);
  const travellers = e.adults !== null ? `${e.adults} adult${e.adults === 1 ? "" : "s"}${e.children ? `, ${e.children} child${e.children === 1 ? "" : "ren"}` : ""}` : null;

  const details: [string, React.ReactNode][] = (
    [
      ["Email", <a key="e" href={`mailto:${e.email}?subject=${encodeURIComponent(`Your enquiry ${e.reference}`)}`} className="link break-all">{e.email}</a>],
      ["Phone", e.phone ? <a key="p" href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="link">{e.phone}</a> : null],
      ["Package", e.package?.title ?? null],
      ["Route", e.destinations.length ? e.destinations.map((d) => `${d.nameSnapshot} (${d.days} day${d.days === 1 ? "" : "s"})`).join(" → ") : null],
      ["Travel dates", e.travelStartDate ? formatIsoDate(utcDateToIsoDate(e.travelStartDate)) : e.travelMonth ? `${formatIsoMonth(e.travelMonth)} (flexible)` : null],
      ["Duration", e.durationDays ? `${e.durationDays} days` : null],
      ["Travellers", travellers],
      ["Accommodation", accommodationLabel(e.accommodationPreference)],
      ["Transport", transportLabel(e.transportPreference)],
      ["Interests", e.interests.length ? e.interests.map(interestLabel).join(", ") : null],
      ["Add-ons", snapshot?.addons?.length ? snapshot.addons.map((a) => a.name).join(", ") : null],
      ["Budget", e.budget],
      ["Promo code", e.promoCode],
      ["Submitted from", e.sourcePage],
    ] as [string, React.ReactNode][]
  ).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/enquiries", label: "Enquiries" }}
        title={e.customerName}
        description={`${e.reference} · ${TYPES[e.type]} · received ${formatDateTime(e.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <EnquiryStatusBadge status={e.status} />
            {e.archivedAt && <Badge>Archived</Badge>}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Request">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
              {details.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {e.message && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Message</p>
                <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{e.message}</p>
              </div>
            )}
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Estimate at submission</p>
              {estimate?.kind === "ESTIMATED" ? (
                <div className="mt-2 text-sm">
                  <p className="font-semibold text-ink">{formatINR(estimate.totalPaise)} (indicative)</p>
                  <ul className="mt-1 text-muted">
                    {estimate.lines.map((l) => <li key={l.label + l.detail}>{l.label}: {l.detail} — {formatINR(l.amountPaise)}</li>)}
                    {estimate.promo && <li>{estimate.promo.code}: {estimate.promo.message}{estimate.promo.applied ? ` (−${formatINR(estimate.promo.discountPaise)})` : ""}</li>}
                  </ul>
                </div>
              ) : estimate?.kind === "QUOTE_REQUIRED" ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-muted">{estimate.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              ) : (
                <p className="mt-2 text-sm text-muted">Not applicable.</p>
              )}
            </div>
            <details className="mt-5 border-t border-line pt-4 text-sm">
              <summary className="cursor-pointer text-muted">Original submission (as received)</summary>
              <pre className="mt-3 max-h-80 overflow-auto rounded-sm bg-paper p-3 text-xs whitespace-pre-wrap">{JSON.stringify(e.snapshot, null, 2)}</pre>
            </details>
          </Card>

          <Card title="Notes">
            <ActionForm action={addNoteAction} resetOnSuccess>
              <input type="hidden" name="enquiryId" value={e.id} />
              <label htmlFor="note-body" className="sr-only">New note</label>
              <textarea id="note-body" name="body" rows={3} className="input" placeholder="Call summary, quote details, next steps…" required />
              <div className="mt-2"><SubmitButton>Add note</SubmitButton></div>
            </ActionForm>
            {e.notes.length > 0 && (
              <ul className="mt-5 space-y-4">
                {e.notes.map((n) => (
                  <li key={n.id} className="border-l-2 border-line-strong pl-4 text-sm">
                    <p className="whitespace-pre-wrap text-ink">{n.body}</p>
                    <p className="mt-1 text-xs text-muted">{n.author?.name ?? "Former staff member"} · {formatDateTime(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Emails">
            {e.emails.length === 0 ? (
              <p className="text-sm text-muted">{e.status === "SPAM" ? "No emails are sent for submissions flagged as spam." : "No emails were queued for this enquiry."}</p>
            ) : (
              <ul className="space-y-4">
                {e.emails.map((m) => (
                  <li key={m.id} className="rounded-sm border border-line p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{KIND_LABELS[m.kind]}</p>
                      <EmailStatusBadge status={m.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      To {m.toAddress || "business inbox (set in Email delivery)"} · {m.attempts} attempt{m.attempts === 1 ? "" : "s"}
                      {m.sentAt && ` · sent ${formatDateTime(m.sentAt)}`}
                      {m.status === "PENDING" && ` · next attempt ${formatDateTime(m.nextAttemptAt)}`}
                    </p>
                    {m.lastErrorMessage && m.status !== "SENT" && <p className="mt-2 text-xs text-danger">{m.lastErrorCode}: {m.lastErrorMessage}</p>}
                    {m.attemptLog.length > 0 && (
                      <details className="mt-2 text-xs text-muted">
                        <summary className="cursor-pointer">Attempt history</summary>
                        <ul className="mt-2 space-y-1">
                          {m.attemptLog.map((a) => <li key={a.id}>{formatDateTime(a.finishedAt)} — {a.outcome.replace(/_/g, " ").toLowerCase()}{a.errorCode ? ` (${a.errorCode})` : ""}</li>)}
                        </ul>
                      </details>
                    )}
                    {(m.status === "FAILED" || m.status === "CANCELLED" || m.status === "PENDING") && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionForm action={retryEmailAction}>
                          <input type="hidden" name="deliveryId" value={m.id} />
                          <SubmitButton variant="secondary">{m.status === "PENDING" ? "Send now" : "Retry"}</SubmitButton>
                        </ActionForm>
                        {m.status !== "CANCELLED" && (
                          <ActionForm action={cancelEmailAction}>
                            <input type="hidden" name="deliveryId" value={m.id} />
                            <SubmitButton variant="secondary">Cancel</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    )}
                    {m.lastErrorCode === "UNKNOWN_OUTCOME" && <p className="mt-2 text-xs text-muted">Check the inbox (or ask the customer) before retrying, to avoid sending this twice.</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Status">
            {transitions.length === 0 ? (
              <p className="text-sm text-muted">No further status changes are available.</p>
            ) : (
              <ActionForm action={updateStatusAction} resetOnSuccess>
                <input type="hidden" name="enquiryId" value={e.id} />
                <label htmlFor="status" className="field-label">Move to</label>
                <select id="status" name="status" className="input" defaultValue={transitions[0]}>
                  {transitions.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <label htmlFor="status-note" className="field-label mt-3">Note <span className="font-normal text-muted">(optional)</span></label>
                <input id="status-note" name="note" className="input" />
                <div className="mt-3"><SubmitButton>Update status</SubmitButton></div>
              </ActionForm>
            )}
            <p className="mt-3 text-xs text-muted">“Confirmed” records that the customer accepted the quote. It is not a payment-confirmed booking.</p>
            {e.statusHistory.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-4 text-xs text-muted">
                {e.statusHistory.map((h) => (
                  <li key={h.id}>
                    <span className="text-ink">{h.fromStatus ? `${STATUS_LABELS[h.fromStatus]} → ` : ""}{STATUS_LABELS[h.toStatus]}</span>
                    {" · "}{h.changedBy?.name ?? (h.fromStatus ? "Former staff member" : "Website")} · {formatDateTime(h.createdAt)}
                    {h.note && <span className="block">“{h.note}”</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Handling">
            <ActionForm action={updateHandlingAction}>
              <input type="hidden" name="enquiryId" value={e.id} />
              <label htmlFor="assigneeId" className="field-label">Assigned to</label>
              <select id="assigneeId" name="assigneeId" className="input" defaultValue={e.assignee?.id ?? ""}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <label htmlFor="followUpAt" className="field-label mt-3">Follow up on (IST)</label>
              <input id="followUpAt" name="followUpAt" type="datetime-local" className="input" defaultValue={toIstInput(e.followUpAt)} />
              <div className="mt-3"><SubmitButton>Save</SubmitButton></div>
            </ActionForm>
          </Card>

          <Card title="Record">
            <div className="space-y-3">
              <ActionForm action={archiveAction}>
                <input type="hidden" name="enquiryId" value={e.id} />
                <input type="hidden" name="archived" value={e.archivedAt ? "false" : "true"} />
                <SubmitButton variant="secondary">{e.archivedAt ? "Restore from archive" : "Archive"}</SubmitButton>
              </ActionForm>
              {hasRole(user, "ADMIN") && (
                <ConfirmAction
                  action={deleteEnquiryAction}
                  fields={{ enquiryId: e.id }}
                  label="Delete permanently"
                  confirmLabel="Yes, delete"
                  warning="This permanently removes the enquiry, its notes and email history. Only the reference is kept in the audit log."
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
