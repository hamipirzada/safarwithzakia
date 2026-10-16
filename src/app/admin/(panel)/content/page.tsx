import { ActionForm, SubmitButton, TextField } from "@/components/admin/forms";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/authz";
import { getSetting } from "@/server/settings";
import { saveAboutAction, saveAnnouncementAction, saveHomeAction } from "./actions";

export const metadata = { title: "Site content" };

export default async function ContentPage() {
  await requireStaffPage();
  const [home, about, announcement] = await Promise.all([getSetting("home"), getSetting("about"), getSetting("announcement")]);
  return (
    <>
      <PageHeader title="Site content" description="Text on the home and about pages, and the optional announcement banner." />
      <div className="space-y-6">
        <Card title="Announcement banner">
          <ActionForm version={JSON.stringify(announcement)} action={saveAnnouncementAction}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><TextField label="Message" name="message" defaultValue={announcement.message} hint="Up to 160 characters." /></div>
              <TextField label="Link path" name="linkHref" defaultValue={announcement.linkHref} placeholder="/packages" />
              <TextField label="Link text" name="linkLabel" defaultValue={announcement.linkLabel} placeholder="See packages" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={announcement.enabled} className="h-5 w-5 accent-[var(--color-ink)]" /> Show the banner on every page</label>
            </div>
            <div className="mt-4"><SubmitButton>Save banner</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title="Home page">
          <ActionForm version={JSON.stringify(home)} action={saveHomeAction}>
            <div className="grid gap-4">
              <TextField label="Small heading above the title" name="heroEyebrow" defaultValue={home.heroEyebrow} />
              <TextField label="Main title" name="heroTitle" required defaultValue={home.heroTitle} />
              <TextField label="Introduction" name="heroSubtitle" multiline rows={3} defaultValue={home.heroSubtitle} />
              <TextField label="“How it works” heading" name="introTitle" defaultValue={home.introTitle} />
              <TextField label="“How it works” text" name="introBody" multiline rows={3} defaultValue={home.introBody} />
            </div>
            <div className="mt-4"><SubmitButton>Save home page</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title="About page">
          <ActionForm version={JSON.stringify(about)} action={saveAboutAction}>
            <div className="grid gap-4">
              <TextField label="Title" name="title" required defaultValue={about.title} />
              <TextField label="Lead sentence" name="lead" defaultValue={about.lead} />
              <TextField label="Our story" name="story" multiline rows={8} defaultValue={about.story.join("\n\n")} hint="Leave a blank line between paragraphs." />
              <TextField label="Mission" name="mission" multiline rows={2} defaultValue={about.mission} />
              <TextField label="Vision" name="vision" multiline rows={2} defaultValue={about.vision} />
              <TextField label="How we work" name="values" multiline rows={4} defaultValue={about.values.join("\n")} hint="One per line. Only list commitments the business can honour." />
              <TextField label="Team" name="team" multiline rows={4} defaultValue={about.team.map((m) => `${m.name} — ${m.role}`).join("\n")} hint="One person per line: Name — Role" />
              <TextField label="Closing quote" name="quote" multiline rows={2} defaultValue={about.quote} />
              <TextField label="Quote attribution" name="quoteAttribution" defaultValue={about.quoteAttribution} />
            </div>
            <div className="mt-4"><SubmitButton>Save about page</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
