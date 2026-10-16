"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { businessSchema } from "@/domain/settings";
import { adminAction } from "@/server/admin/action";
import { audit } from "@/server/audit";
import { saveSetting } from "@/server/settings";

const toE164 = (v: string) => {
  const digits = v.replace(/[^\d+]/g, "");
  return digits ? (digits.startsWith("+") ? digits : `+${digits}`) : "";
};

export const saveBusinessAction = adminAction(
  "ADMIN",
  z
    .object({
      name: z.string(), tagline: z.string(), phone: z.string(), whatsapp: z.string(), whatsappMessage: z.string(), email: z.string().trim().toLowerCase(),
      office1Label: z.string(), office1Address: z.string(), office2Label: z.string(), office2Address: z.string(),
      mapUrl: z.string().trim(), instagramUrl: z.string().trim(), facebookUrl: z.string().trim(), youtubeUrl: z.string().trim(),
    })
    .transform((raw) => ({
      name: raw.name,
      tagline: raw.tagline,
      phone: raw.phone.trim(),
      phoneE164: toE164(raw.phone),
      whatsappE164: toE164(raw.whatsapp),
      whatsappMessage: raw.whatsappMessage,
      email: raw.email,
      offices: [
        { label: raw.office1Label.trim(), address: raw.office1Address.trim() },
        { label: raw.office2Label.trim(), address: raw.office2Address.trim() },
      ].filter((o) => o.address),
      mapUrl: raw.mapUrl,
      instagramUrl: raw.instagramUrl,
      facebookUrl: raw.facebookUrl,
      youtubeUrl: raw.youtubeUrl,
    }))
    .pipe(businessSchema),
  async (data, user) => {
    await saveSetting("business", data, user.id);
    await audit({ actorId: user.id, action: "settings.business_updated", entityType: "SiteSetting", entityId: "business" });
    revalidatePath("/", "layout");
    return { status: "success", message: "Business details saved." };
  },
);
