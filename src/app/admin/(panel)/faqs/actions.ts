"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PUBLICATION_STATUSES } from "@/domain/admin-schemas";
import { adminAction } from "@/server/admin/action";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";

const schema = z.object({
  id: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null),
  question: z.string().trim().min(5, "Enter the question.").max(200),
  answer: z.string().trim().min(5, "Enter the answer.").max(2000),
  status: z.enum(PUBLICATION_STATUSES),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const saveFaqAction = adminAction("STAFF", schema, async ({ id, ...data }, user) => {
  const row = id ? await prisma.faq.update({ where: { id }, data }) : await prisma.faq.create({ data });
  await audit({ actorId: user.id, action: id ? "faq.updated" : "faq.created", entityType: "Faq", entityId: row.id });
  revalidatePath("/", "layout");
  return { status: "success", message: "FAQ saved." };
});

export const deleteFaqAction = adminAction("STAFF", z.object({ id: z.uuid() }), async ({ id }, user) => {
  await prisma.faq.delete({ where: { id } });
  await audit({ actorId: user.id, action: "faq.deleted", entityType: "Faq", entityId: id });
  revalidatePath("/", "layout");
  return { status: "success", message: "FAQ deleted." };
});
