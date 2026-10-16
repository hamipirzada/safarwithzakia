import { PackageEditor } from "@/components/admin/PackageEditor";
import { emptyPackage } from "@/domain/admin-schemas";
import { PageHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { prisma } from "@/server/db";
import { listMediaOptions } from "@/server/media";
import { savePackageAction } from "../actions";

export const metadata = { title: "New package" };

export default async function NewPackagePage() {
  await requireStaffPage();
  const [media, destinations] = await Promise.all([
    listMediaOptions(),
    prisma.destination.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }),
  ]);
  return (
    <>
      <PageHeader back={{ href: "/admin/packages", label: "Packages" }} title="New package" description="New packages are saved as drafts. Publish when the details are confirmed." />
      <PackageEditor id={null} initial={emptyPackage()} media={media} destinations={destinations} action={savePackageAction} />
    </>
  );
}
