import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, MailWarning } from "lucide-react";
import { formatDateTime } from "@/domain/dates";
import { STATUS_LABELS } from "@/domain/enquiry-status";
import { BarList, ChangeNote, ColumnChart, TrendChart } from "@/components/admin/charts";
import { Card, EmptyState, EnquiryStatusBadge, PageHeader, Stat } from "@/components/admin/ui";
import { hasRole, requireStaffPage } from "@/server/authz";
import { DASHBOARD_RANGES, getDashboardData, parseRange, type DashboardData } from "@/server/dashboard";
import { resolveGmailTransport } from "@/server/email/config";
import { errorMessage, log } from "@/server/logger";

export const metadata = { title: "Dashboard" };

const TYPE_LABEL = { CONTACT: "Contact", PACKAGE: "Package", CUSTOM_TRIP: "Custom trip" } as const;

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireStaffPage();
  const params = await searchParams;
  const range = parseRange(params.range);
  const isAdmin = hasRole(user, "ADMIN");

  let data: DashboardData | null = null;
  let email: Awaited<ReturnType<typeof resolveGmailTransport>> | null = null;
  try {
    [data, email] = await Promise.all([getDashboardData(range), resolveGmailTransport()]);
  } catch (error) {
    // Never show zeros for a failed query: show that the numbers are unavailable.
    log.error("dashboard.load_failed", { error: errorMessage(error) });
  }

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} description="Enquiries and follow-ups at a glance." />

      {params.denied === "1" && <p className="mb-6 rounded-sm bg-warning-soft p-3 text-sm">That page needs administrator access.</p>}

      {/* One filter row; it scopes every period-based figure below. */}
      <nav aria-label="Dashboard period" className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Period</span>
        {Object.entries(DASHBOARD_RANGES).map(([key, r]) => (
          <Link
            key={key}
            href={key === "30d" ? "/admin" : `/admin?range=${key}`}
            aria-current={key === range ? "page" : undefined}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft hover:border-line-strong aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
          >
            {r.label}
          </Link>
        ))}
      </nav>

      {!data ? (
        <div role="alert" className="flex gap-3 rounded-sm border border-danger/30 bg-danger-soft p-5">
          <AlertTriangle aria-hidden className="mt-0.5 shrink-0 text-danger" size={20} />
          <div>
            <p className="font-semibold text-ink">Dashboard figures are unavailable right now</p>
            <p className="mt-1 text-sm text-ink-soft">The database could not be reached, so no figures are shown rather than misleading zeros. Try again in a moment.</p>
            <Link href="/admin" className="btn btn-sm btn-secondary mt-3">Try again</Link>
          </div>
        </div>
      ) : (
        <Dashboard data={data} isAdmin={isAdmin} emailReady={email?.ok ?? false} emailMessage={email && !email.ok ? email.message : null} />
      )}
    </>
  );
}

function Dashboard({ data, isAdmin, emailReady, emailMessage }: { data: DashboardData; isAdmin: boolean; emailReady: boolean; emailMessage: string | null }) {
  const rangeLabel = DASHBOARD_RANGES[data.range].label.toLowerCase();
  const period = DASHBOARD_RANGES[data.range].period;
  const statusTotal = data.statuses.reduce((s, x) => s + x.count, 0);
  return (
    <div className="space-y-6">
      {!emailReady && (
        <div className="flex gap-3 rounded-sm border border-warning/30 bg-warning-soft p-4 text-sm">
          <MailWarning aria-hidden size={18} className="mt-0.5 shrink-0 text-warning" />
          <p>
            <span className="font-semibold">Email notifications are not being sent.</span> {emailMessage} Enquiries are still saved; queued emails send once this is fixed.{" "}
            {isAdmin && <Link href="/admin/email-settings" className="link">Open email settings</Link>}
          </p>
        </div>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat
          label="Enquiries received"
          sublabel={rangeLabel}
          value={data.kpis.newInRange}
          href="/admin/enquiries"
          testId="kpi-received"
          spark={data.trend.map((p) => p.total)}
          footer={<ChangeNote current={data.kpis.newInRange} previous={data.previousTotal} periodLabel={period} />}
        />
        <Stat label="Open enquiries" sublabel="right now" value={data.kpis.openNow} href="/admin/enquiries?view=open" testId="kpi-open" />
        <Stat label="Follow-ups due" sublabel="right now" value={data.kpis.dueNow} href="/admin/enquiries?view=due" tone="danger" testId="kpi-due" />
        <Stat label="Published packages" value={data.kpis.publishedPackages} href="/admin/packages" testId="kpi-packages" />
        <Stat label="Published destinations" value={data.kpis.publishedDestinations} href="/admin/destinations" testId="kpi-destinations" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Enquiries received" description={`Per ${data.unit}, ${rangeLabel}, India time. Spam excluded.`}>
          <TrendChart data={data.trend} previous={data.previousTrend} unit={data.unit} periodLabel={period} label={`Enquiries received per ${data.unit}, ${rangeLabel}`} />
        </Card>
        <Card title="Busiest days of the week" description={`Enquiries per weekday, ${rangeLabel}, India time. Spam excluded.`}>
          <ColumnChart label="Enquiries by day of the week" unitLabel="Enquiries" emptyMessage="No enquiries in this period." data={data.weekdays} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Status of enquiries" description={`Current status of enquiries received ${rangeLabel}.`}>
          <BarList
            label="Enquiries by current status"
            unitLabel="Enquiries"
            total={statusTotal}
            emptyMessage="No enquiries in this period."
            data={data.statuses.filter((s) => s.count > 0).map((s) => ({ label: STATUS_LABELS[s.status], count: s.count, href: `/admin/enquiries?status=${s.status}` }))}
          />
        </Card>
        <Card title="Most requested packages" description={`Package enquiries ${rangeLabel}.`}>
          <BarList label="Most requested packages" unitLabel="Enquiries" emptyMessage="No package enquiries in this period." data={data.topPackages} />
        </Card>
        <Card title="Most requested destinations" description={`Stops in custom trips and package enquiries ${rangeLabel}.`}>
          <BarList label="Most requested destinations" unitLabel="Requests" emptyMessage="No destination requests in this period." data={data.topDestinations} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Follow-up queue" description="Open enquiries due within 7 days, earliest first." className="lg:col-span-2">
          {data.followUps.length === 0 ? (
            <EmptyState title="Nothing due">No open enquiry has a follow-up date in the next 7 days.</EmptyState>
          ) : (
            <ul className="-my-2 divide-y divide-line" data-section="follow-ups">
              {data.followUps.map((e) => {
                const overdue = e.followUpAt! <= new Date();
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/admin/enquiries/${e.id}`} className="font-medium text-ink hover:underline">{e.customerName}</Link>
                      <p className="text-xs text-muted">{e.reference}{e.assignee ? ` · ${e.assignee.name}` : " · Unassigned"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1 text-xs ${overdue ? "font-semibold text-danger" : "text-muted"}`}>
                        {overdue ? <AlertTriangle aria-hidden size={13} /> : <Clock3 aria-hidden size={13} />}
                        {overdue ? "Overdue · " : ""}{formatDateTime(e.followUpAt!)}
                      </span>
                      <EnquiryStatusBadge status={e.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Email delivery" description="Notifications and acknowledgements.">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="inline-flex items-center gap-2 text-ink-soft"><CheckCircle2 aria-hidden size={16} className="text-[#0ca30c]" /> Sent, {rangeLabel}</dt>
              <dd className="font-semibold text-ink tabular-nums" data-testid="email-sent">{data.email.sentInRange}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="inline-flex items-center gap-2 text-ink-soft"><Clock3 aria-hidden size={16} className="text-[#b07c0e]" /> Queued now</dt>
              <dd className="font-semibold text-ink tabular-nums" data-testid="email-queued">{data.email.queued}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="inline-flex items-center gap-2 text-ink-soft"><AlertTriangle aria-hidden size={16} className="text-[#d03b3b]" /> Failed now</dt>
              <dd className={`font-semibold tabular-nums ${data.email.failed ? "text-danger" : "text-ink"}`} data-testid="email-failed">{data.email.failed}</dd>
            </div>
          </dl>
          {isAdmin && <Link href="/admin/email-settings" className="link mt-4 inline-block text-sm">Email delivery details</Link>}
        </Card>
      </div>

      <Card title="Recent enquiries" actions={<Link href="/admin/enquiries" className="link text-sm">View all</Link>}>
        {data.recent.length === 0 ? (
          <EmptyState title="No enquiries yet">New submissions from the website will appear here.</EmptyState>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-line bg-paper/60 text-left text-xs text-muted">
                <tr><th className="px-5 py-2.5 font-medium">Customer</th><th className="px-5 py-2.5 font-medium">Request</th><th className="px-5 py-2.5 font-medium">Status</th><th className="px-5 py-2.5 text-right font-medium">Received</th></tr>
              </thead>
              <tbody>
                {data.recent.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0 hover:bg-paper/50">
                    <td className="px-5 py-3"><Link href={`/admin/enquiries/${e.id}`} className="font-medium text-ink hover:underline">{e.customerName}</Link><p className="text-xs text-muted">{e.reference}</p></td>
                    <td className="px-5 py-3 text-ink-soft">{TYPE_LABEL[e.type]}{e.package ? ` · ${e.package.title}` : ""}</td>
                    <td className="px-5 py-3"><EnquiryStatusBadge status={e.status} /></td>
                    <td className="px-5 py-3 text-right text-xs whitespace-nowrap text-muted">{formatDateTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
