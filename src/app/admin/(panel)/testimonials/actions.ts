"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PUBLICATION_STATUSES } from "@/domain/admin-schemas";
import { adminAction, formCheckbox, formOptionalText, UserFacingError } from "@/server/admin/action";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";

const schema = z.object({
  id: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
  authorName: z.string().trim().min(2, "Enter the guest's name.").max(80),
  location: formOptionalText(80),
  quote: z.string().trim().min(10, "Enter the review.").max(1200),
  rating: z.union([z.literal(""), z.coerce.number().int().min(1).max(5)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  source: formOptionalText(200),
  consentConfirmed: formCheckbox,
  status: z.enum(PUBLICATION_STATUSES),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const saveTestimonialAction = adminAction("STAFF", schema, async ({ id, ...data }, user) => {
  if (data.status === "PUBLISHED" && !data.consentConfirmed) {
    throw new UserFacingError("Confirm that this review is genuine and the guest agreed to publication before publishing it.");
  }
  const row = id ? await prisma.testimonial.update({ where: { id }, data }) : await prisma.testimonial.create({ data });
  await audit({ actorId: user.id, action: id ? "testimonial.updated" : "testimonial.created", entityType: "Testimonial", entityId: row.id, metadata: { status: data.status, consentConfirmed: data.consentConfirmed } });
  revalidatePath("/", "layout");
  return { status: "success", message: "Testimonial saved." };
});

export const deleteTestimonialAction = adminAction("STAFF", z.object({ id: z.uuid() }), async ({ id }, user) => {
  await prisma.testimonial.delete({ where: { id } });
  await audit({ actorId: user.id, action: "testimonial.deleted", entityType: "Testimonial", entityId: id });
  revalidatePath("/", "layout");
  return { status: "success", message: "Testimonial deleted." };
});
