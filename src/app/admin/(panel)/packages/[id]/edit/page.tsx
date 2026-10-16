import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageEditor } from "@/components/admin/PackageEditor";
import { StatusControls } from "@/components/admin/StatusControls";
import { PageHeader, PublicationBadge } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { loadPackageInput } from "@/server/catalog-admin";
import { prisma } from "@/server/db";
import { listMediaOptions } from "@/server/media";
import { packageStatusAction, savePackageAction } from "../../actions";

export const metadata = { title: "Edit package" };

export default async function EditPackagePage({ params }: PageProps<"/admin/packages/[id]/edit">) {
  const { id } = await params;
  await requireStaffPage();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [loaded, media, destinations] = await Promise.all([
    loadPackageInput(id),
    listMediaOptions(),
    prisma.destination.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }),
  ]);
  if (!loaded) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/admin/packages", label: "Packages" }}
        title={loaded.input.title}
        description={`/packages/${loaded.input.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <PublicationBadge status={loaded.status} />
            {loaded.status === "PUBLISHED" && <Link href={`/packages/${loaded.input.slug}`} target="_blank" className="btn btn-sm btn-ghost">View on site</Link>}
            <StatusControls id={id} status={loaded.status} action={packageStatusAction} />
          </div>
        }
      />
      <PackageEditor key={id} version={loaded.version} id={id} initial={loaded.input} media={media} destinations={destinations} action={savePackageAction} />
    </>
  );
}
