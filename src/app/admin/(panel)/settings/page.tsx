import { ActionForm, SubmitButton, TextField } from "@/components/admin/forms";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { getSetting } from "@/server/settings";
import { saveBusinessAction } from "./actions";

export const metadata = { title: "Business details" };

export default async function SettingsPage() {
  await requireStaffPage("ADMIN", "/admin/settings");
  const b = await getSetting("business");
  const [o1, o2] = [b.offices[0], b.offices[1]];
  return (
    <>
      <PageHeader title="Business details" description="Shown in the header, footer, contact page, emails and search-engine data. Only enter details the business publishes." />
      <ActionForm version={JSON.stringify(b)} action={saveBusinessAction}>
        <div className="space-y-6">
          <Card title="Identity">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Business name" name="name" required defaultValue={b.name} />
              <TextField label="Tagline" name="tagline" defaultValue={b.tagline} />
            </div>
          </Card>
          <Card title="Contact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Phone (as displayed)" name="phone" defaultValue={b.phone} placeholder="+91 88992 77396" />
              <TextField label="WhatsApp number" name="whatsapp" defaultValue={b.whatsappE164} hint="With country code. Leave blank to hide WhatsApp buttons." />
              <TextField label="Public email" name="email" type="email" defaultValue={b.email} />
              <TextField label="WhatsApp greeting" name="whatsappMessage" defaultValue={b.whatsappMessage} />
            </div>
          </Card>
          <Card title="Offices">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
              <TextField label="Office 1 label" name="office1Label" defaultValue={o1?.label ?? "Head office"} />
              <TextField label="Office 1 address" name="office1Address" defaultValue={o1?.address} />
              <TextField label="Office 2 label" name="office2Label" defaultValue={o2?.label ?? "Branch office"} />
              <TextField label="Office 2 address" name="office2Address" defaultValue={o2?.address} />
            </div>
            <div className="mt-4"><TextField label="Google Maps link" name="mapUrl" defaultValue={b.mapUrl} hint="https:// link to the business's own map location." /></div>
          </Card>
          <Card title="Social profiles">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField label="Instagram" name="instagramUrl" defaultValue={b.instagramUrl} />
              <TextField label="Facebook" name="facebookUrl" defaultValue={b.facebookUrl} />
              <TextField label="YouTube" name="youtubeUrl" defaultValue={b.youtubeUrl} />
            </div>
          </Card>
          <SubmitButton>Save business details</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
