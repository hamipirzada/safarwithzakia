import { DestinationEditor } from "@/components/admin/DestinationEditor";
import { emptyDestination } from "@/domain/admin-schemas";
import { PageHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { listMediaOptions } from "@/server/media";
import { saveDestinationAction } from "../actions";

export const metadata = { title: "New destination" };

export default async function NewDestinationPage() {
  await requireStaffPage();
  const media = await listMediaOptions();
  return (
    <>
      <PageHeader back={{ href: "/admin/destinations", label: "Destinations" }} title="New destination" description="Saved as a draft until you publish it." />
      <DestinationEditor id={null} initial={emptyDestination()} media={media} action={saveDestinationAction} />
    </>
  );
}
