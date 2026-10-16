import { formatDateTime } from "@/domain/dates";
import { EmptyState, PageHeader, Pagination, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";

export const metadata = { title: "Audit log" };
const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaffPage("ADMIN", "/admin/audit");
  const { page: raw } = await searchParams;
  const page = Math.max(1, Number(raw) || 1);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { actor: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Audit log" description="Sensitive staff actions: status changes, content and settings edits, exports, deletions and account changes." />
      {rows.length === 0 ? (
        <EmptyState title="No activity recorded yet" />
      ) : (
        <Table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-xs whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</td>
                <td>{r.actor?.name ?? (r.action.endsWith("_cli") ? "Command line" : "—")}</td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="text-xs text-muted">{r.entityType}{r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""}</td>
                <td className="max-w-xs text-xs break-words text-muted">{r.metadata ? JSON.stringify(r.metadata) : ""}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} makeHref={(p) => `/admin/audit?page=${p}`} />
    </>
  );
}
