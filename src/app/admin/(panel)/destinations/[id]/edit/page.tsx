import Link from "next/link";
import { notFound } from "next/navigation";
import { DestinationEditor } from "@/components/admin/DestinationEditor";
import { StatusControls } from "@/components/admin/StatusControls";
import { PageHeader, PublicationBadge } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { loadDestinationInput } from "@/server/catalog-admin";
import { listMediaOptions } from "@/server/media";
import { destinationStatusAction, saveDestinationAction } from "../../actions";

export const metadata = { title: "Edit destination" };

export default async function EditDestinationPage({ params }: PageProps<"/admin/destinations/[id]/edit">) {
  const { id } = await params;
  await requireStaffPage();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [loaded, media] = await Promise.all([loadDestinationInput(id), listMediaOptions()]);
  if (!loaded) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/admin/destinations", label: "Destinations" }}
        title={loaded.input.name}
        description={`/destinations/${loaded.input.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <PublicationBadge status={loaded.status} />
            {loaded.status === "PUBLISHED" && <Link href={`/destinations/${loaded.input.slug}`} target="_blank" className="btn btn-sm btn-ghost">View on site</Link>}
            <StatusControls id={id} status={loaded.status} action={destinationStatusAction} />
          </div>
        }
      />
      <DestinationEditor key={id} version={loaded.version} id={id} initial={loaded.input} media={media} action={saveDestinationAction} />
    </>
  );
}
