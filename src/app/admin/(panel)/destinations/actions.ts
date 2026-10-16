"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { destinationInput, PUBLICATION_STATUSES } from "@/domain/admin-schemas";
import { adminAction } from "@/server/admin/action";
import { saveDestination, setDestinationStatus } from "@/server/catalog-admin";

export const saveDestinationAction = adminAction("STAFF", z.object({ id: z.uuid().nullable(), data: destinationInput }), async ({ id, data }, user) => {
  const savedId = await saveDestination(id, data, user.id);
  revalidatePath("/", "layout");
  return { status: "success", message: "Destination saved.", redirectTo: id ? undefined : `/admin/destinations/${savedId}/edit` };
});

export const destinationStatusAction = adminAction("STAFF", z.object({ id: z.uuid(), status: z.enum(PUBLICATION_STATUSES) }), async ({ id, status }, user) => {
  await setDestinationStatus(id, status, user.id);
  revalidatePath("/", "layout");
  return { status: "success", message: status === "PUBLISHED" ? "Destination published." : status === "ARCHIVED" ? "Destination archived." : "Destination moved to draft." };
});
