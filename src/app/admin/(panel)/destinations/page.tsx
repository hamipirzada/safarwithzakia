import Link from "next/link";
import { EmptyState, PageHeader, PublicationBadge, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { fromPriceLabel, toRateRule } from "@/server/catalog";
import { prisma } from "@/server/db";

export const metadata = { title: "Destinations" };

export default async function AdminDestinationsPage() {
  await requireStaffPage();
  const destinations = await prisma.destination.findMany({
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { pricingRules: true, _count: { select: { packages: true } } },
  });
  return (
    <>
      <PageHeader title="Destinations" description="Places offered in the trip builder and on destination pages." actions={<Link href="/admin/destinations/new" className="btn btn-sm btn-primary">New destination</Link>} />
      {destinations.length === 0 ? (
        <EmptyState title="No destinations yet" />
      ) : (
        <Table>
          <thead><tr><th>Destination</th><th>Rates</th><th>Status</th><th>In packages</th></tr></thead>
          <tbody>
            {destinations.map((d) => {
              const active = d.pricingRules.filter((r) => r.active);
              const inactive = d.pricingRules.length - active.length;
              return (
                <tr key={d.id}>
                  <td>
                    <Link href={`/admin/destinations/${d.id}/edit`} className="font-medium text-ink hover:underline">{d.name}</Link>
                    <p className="text-xs text-muted">/destinations/{d.slug}</p>
                  </td>
                  <td className="text-sm">
                    {fromPriceLabel(active.map(toRateRule)) ?? <span className="text-muted">Quote on request</span>}
                    {inactive > 0 && <p className="text-xs text-warning">{inactive} inactive rate{inactive === 1 ? "" : "s"} awaiting confirmation</p>}
                  </td>
                  <td><PublicationBadge status={d.status} /></td>
                  <td className="tabular-nums">{d._count.packages}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
