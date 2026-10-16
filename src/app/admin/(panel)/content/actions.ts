"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aboutContentSchema, announcementSchema, homeContentSchema } from "@/domain/settings";
import { adminAction, formCheckbox } from "@/server/admin/action";
import { audit } from "@/server/audit";
import { saveSetting } from "@/server/settings";

const lines = (v: unknown) => String(v ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const paragraphs = (v: unknown) => String(v ?? "").split(/\r?\n\s*\r?\n/).map((p) => p.replace(/\s*\r?\n\s*/g, " ").trim()).filter(Boolean);

export const saveHomeAction = adminAction("STAFF", homeContentSchema, async (data, user) => {
  await saveSetting("home", data, user.id);
  await audit({ actorId: user.id, action: "content.home_updated", entityType: "SiteSetting", entityId: "home" });
  revalidatePath("/", "layout");
  return { status: "success", message: "Home page text saved." };
});

export const saveAnnouncementAction = adminAction(
  "STAFF",
  z.object({ enabled: formCheckbox, message: z.string().optional().default(""), linkHref: z.string().optional().default(""), linkLabel: z.string().optional().default("") }).pipe(announcementSchema),
  async (data, user) => {
    await saveSetting("announcement", data, user.id);
    await audit({ actorId: user.id, action: "content.announcement_updated", entityType: "SiteSetting", entityId: "announcement", metadata: { enabled: data.enabled } });
    revalidatePath("/", "layout");
    return { status: "success", message: data.enabled ? "Announcement banner is live." : "Announcement saved (hidden)." };
  },
);

export const saveAboutAction = adminAction(
  "STAFF",
  z
    .object({ title: z.string(), lead: z.string(), story: z.string(), mission: z.string(), vision: z.string(), values: z.string(), team: z.string(), quote: z.string(), quoteAttribution: z.string() })
    .transform((raw) => ({
      ...raw,
      story: paragraphs(raw.story),
      values: lines(raw.values),
      team: lines(raw.team).map((line) => {
        const [name, ...role] = line.split(/\s+[—–-]\s+/);
        return { name: (name ?? "").trim(), role: role.join(" - ").trim() };
      }),
    }))
    .pipe(aboutContentSchema),
  async (data, user) => {
    await saveSetting("about", data, user.id);
    await audit({ actorId: user.id, action: "content.about_updated", entityType: "SiteSetting", entityId: "about" });
    revalidatePath("/", "layout");
    return { status: "success", message: "About page saved." };
  },
);
