import Link from "next/link";
import { EmptyState, PageHeader, PublicationBadge, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { fromPriceLabel, toRateRule } from "@/server/catalog";
import { prisma } from "@/server/db";

export const metadata = { title: "Packages" };

export default async function AdminPackagesPage() {
  await requireStaffPage();
  const packages = await prisma.package.findMany({
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    include: { pricingRules: { where: { active: true } }, _count: { select: { enquiries: true, destinations: true } } },
  });
  return (
    <>
      <PageHeader title="Packages" description="Ready-made routes shown on the website. Drafts and archived packages are hidden from visitors." actions={<Link href="/admin/packages/new" className="btn btn-sm btn-primary">New package</Link>} />
      {packages.length === 0 ? (
        <EmptyState title="No packages yet"><Link href="/admin/packages/new" className="link">Create the first package</Link>.</EmptyState>
      ) : (
        <Table>
          <thead><tr><th>Package</th><th>Duration</th><th>Published price</th><th>Status</th><th>Enquiries</th></tr></thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/packages/${p.id}/edit`} className="font-medium text-ink hover:underline">{p.title}</Link>
                  <p className="text-xs text-muted">/packages/{p.slug}{p.featured ? " · featured" : ""}</p>
                </td>
                <td>{p.durationDays}D / {p.durationNights}N</td>
                <td className="text-sm">{fromPriceLabel(p.pricingRules.map(toRateRule)) ?? <span className="text-muted">No active rate</span>}</td>
                <td><PublicationBadge status={p.status} /></td>
                <td className="tabular-nums">{p._count.enquiries}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
