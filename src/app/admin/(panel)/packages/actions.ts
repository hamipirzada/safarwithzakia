"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { packageInput, PUBLICATION_STATUSES } from "@/domain/admin-schemas";
import { adminAction } from "@/server/admin/action";
import { savePackage, setPackageStatus } from "@/server/catalog-admin";

export const savePackageAction = adminAction("STAFF", z.object({ id: z.uuid().nullable(), data: packageInput }), async ({ id, data }, user) => {
  const savedId = await savePackage(id, data, user.id);
  revalidatePath("/", "layout");
  return { status: "success", message: "Package saved.", redirectTo: id ? undefined : `/admin/packages/${savedId}/edit` };
});

export const packageStatusAction = adminAction("STAFF", z.object({ id: z.uuid(), status: z.enum(PUBLICATION_STATUSES) }), async ({ id, status }, user) => {
  await setPackageStatus(id, status, user.id);
  revalidatePath("/", "layout");
  return { status: "success", message: status === "PUBLISHED" ? "Package published." : status === "ARCHIVED" ? "Package archived." : "Package moved to draft." };
});
