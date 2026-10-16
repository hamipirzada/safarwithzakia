import Link from "next/link";
import { formatDateTime, formatIsoMonth, utcDateToIsoDate, formatIsoDate } from "@/domain/dates";
import { ENQUIRY_STATUSES, STATUS_LABELS } from "@/domain/enquiry-status";
import { formatINR } from "@/domain/money";
import type { EnquiryStatus, EnquiryType } from "@/generated/prisma/enums";
import { EmptyState, EnquiryStatusBadge, PageHeader, Pagination, Table } from "@/components/admin/ui";
import { hasRole, requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";
import { enquiryWhere, receivedDate, type EnquiryFilters } from "@/server/enquiries/admin";

export const metadata = { title: "Enquiries" };

const PAGE_SIZE = 25;
const TYPES: Record<EnquiryType, string> = { CONTACT: "Contact", PACKAGE: "Package", CUSTOM_TRIP: "Custom trip" };
const VIEWS = { all: "All active", open: "Open", due: "Follow-up due", archived: "Archived" } as const;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export default async function EnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  const user = await requireStaffPage("STAFF", "/admin/enquiries");
  const params = await searchParams;
  const status = one(params.status) as EnquiryStatus | undefined;
  const type = one(params.type) as EnquiryType | undefined;
  const view = one(params.view) as EnquiryFilters["view"] | undefined;
  const assigneeParam = one(params.assignee);
  const filters: EnquiryFilters = {
    q: one(params.q),
    status: status && ENQUIRY_STATUSES.includes(status) ? status : undefined,
    type: type && type in TYPES ? type : undefined,
    view: view && view in VIEWS ? view : undefined,
    assignee: assigneeParam === "me" ? user.id : assigneeParam === "none" ? "none" : undefined,
    receivedFrom: receivedDate(one(params.from)),
    receivedTo: receivedDate(one(params.to)),
  };
  const page = Math.max(1, Number(one(params.page)) || 1);
  const where = enquiryWhere(filters);

  const [total, rows] = await Promise.all([
    prisma.enquiry.count({ where }),
    prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        type: true,
        status: true,
        customerName: true,
        email: true,
        createdAt: true,
        travelStartDate: true,
        travelMonth: true,
        adults: true,
        children: true,
        estimateStatus: true,
        estimateTotalPaise: true,
        followUpAt: true,
        package: { select: { title: true } },
        destinations: { orderBy: { position: "asc" }, select: { nameSnapshot: true } },
        assignee: { select: { name: true } },
        emails: { where: { status: "FAILED" }, select: { id: true } },
      },
    }),
  ]);

  const query = new URLSearchParams(Object.entries({ q: filters.q, status: filters.status, type: filters.type, view: filters.view, assignee: assigneeParam, from: filters.receivedFrom, to: filters.receivedTo }).filter((e): e is [string, string] => Boolean(e[1])));
  const makeHref = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(p));
    return `/admin/enquiries?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Every contact message, package enquiry and custom trip request saved from the website."
        actions={hasRole(user, "ADMIN") ? <a href={`/admin/enquiries/export?${query}`} className="btn btn-sm btn-secondary">Export CSV</a> : undefined}
      />

      <form className="mb-6 grid grid-cols-1 gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search">
        <div>
          <label htmlFor="q" className="field-label">Search</label>
          <input id="q" name="q" defaultValue={filters.q} placeholder="Reference, name, email or phone" className="input" />
        </div>
        <div>
          <label htmlFor="view" className="field-label">Show</label>
          <select id="view" name="view" defaultValue={filters.view ?? ""} className="input">
            <option value="">All active</option>
            {Object.entries(VIEWS).filter(([k]) => k !== "all").map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="field-label">Status</label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className="input">
            <option value="">Any (excl. spam)</option>
            {ENQUIRY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="type" className="field-label">Type</label>
          <select id="type" name="type" defaultValue={filters.type ?? ""} className="input">
            <option value="">Any</option>
            {Object.entries(TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="assignee" className="field-label">Assigned</label>
          <select id="assignee" name="assignee" defaultValue={assigneeParam ?? ""} className="input">
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="none">Unassigned</option>
          </select>
        </div>
        {filters.receivedFrom && <input type="hidden" name="from" value={filters.receivedFrom} />}
        {filters.receivedTo && <input type="hidden" name="to" value={filters.receivedTo} />}
        <div className="flex items-end gap-2">
          <button type="submit" className="btn btn-primary">Filter</button>
          {query.size > 0 && <Link href="/admin/enquiries" className="btn btn-ghost">Clear</Link>}
        </div>
      </form>

      {(filters.receivedFrom || filters.receivedTo) && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm" data-testid="received-filter">
          <span className="rounded-full bg-lake-soft px-3 py-1 text-lake">
            Received {filters.receivedFrom === filters.receivedTo ? `on ${formatIsoDate(filters.receivedFrom!)}` : `${filters.receivedFrom ? `from ${formatIsoDate(filters.receivedFrom)}` : ""}${filters.receivedTo ? ` to ${formatIsoDate(filters.receivedTo)}` : ""}`} (India time)
          </span>
          <Link
            className="link"
            href={`/admin/enquiries?${new URLSearchParams([...query].filter(([k]) => k !== "from" && k !== "to"))}`}
          >
            Remove date filter
          </Link>
        </p>
      )}
      <p className="mb-3 text-sm text-muted">{total} enquir{total === 1 ? "y" : "ies"}</p>

      {rows.length === 0 ? (
        <EmptyState title="No enquiries match">Try a different search or filter.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Request</th>
              <th>Travel</th>
              <th>Status</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-paper/60">
                <td>
                  <Link href={`/admin/enquiries/${e.id}`} className="font-medium text-ink hover:underline">{e.customerName}</Link>
                  <p className="text-xs text-muted">{e.reference}</p>
                  <p className="text-xs break-all text-muted">{e.email}</p>
                </td>
                <td>
                  <p>{TYPES[e.type]}</p>
                  <p className="text-xs text-muted">{e.package?.title ?? (e.destinations.map((d) => d.nameSnapshot).join(" → ") || "—")}</p>
                  {e.estimateStatus === "ESTIMATED" && e.estimateTotalPaise !== null && <p className="text-xs text-muted">Est. {formatINR(e.estimateTotalPaise)}</p>}
                  {e.estimateStatus === "QUOTE_REQUIRED" && <p className="text-xs text-muted">Quote required</p>}
                </td>
                <td className="text-sm">
                  {e.travelStartDate ? formatIsoDate(utcDateToIsoDate(e.travelStartDate)) : e.travelMonth ? formatIsoMonth(e.travelMonth) : "—"}
                  {e.adults !== null && <p className="text-xs text-muted">{e.adults + (e.children ?? 0)} travellers</p>}
                </td>
                <td>
                  <EnquiryStatusBadge status={e.status} />
                  {e.assignee && <p className="mt-1 text-xs text-muted">{e.assignee.name}</p>}
                  {e.followUpAt && <p className={`mt-1 text-xs ${e.followUpAt <= new Date() ? "text-danger" : "text-muted"}`}>Follow up {formatDateTime(e.followUpAt)}</p>}
                  {e.emails.length > 0 && <p className="mt-1 text-xs text-danger">Email failed</p>}
                </td>
                <td className="text-xs whitespace-nowrap text-muted">{formatDateTime(e.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} makeHref={makeHref} />
    </>
  );
}
