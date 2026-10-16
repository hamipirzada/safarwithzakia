"use server";

import { after } from "next/server";
import { z } from "zod";
import { ENQUIRY_STATUSES } from "@/domain/enquiry-status";
import { adminAction, formOptionalText, UserFacingError } from "@/server/admin/action";
import { audit } from "@/server/audit";
import { cancelDelivery, kickOutbox, retryDelivery } from "@/server/email/outbox";
import { addEnquiryNote, changeEnquiryStatus, deleteEnquiry, setEnquiryArchived, updateEnquiryHandling } from "@/server/enquiries/admin";

const id = z.uuid();

export const updateStatusAction = adminAction(
  "STAFF",
  z.object({ enquiryId: id, status: z.enum(ENQUIRY_STATUSES), note: formOptionalText(1000) }),
  async ({ enquiryId, status, note }, user) => {
    await changeEnquiryStatus(enquiryId, status, note, user.id);
    return { status: "success", message: "Status updated." };
  },
);

export const addNoteAction = adminAction(
  "STAFF",
  z.object({ enquiryId: id, body: z.string().trim().min(1, "Write a note first.").max(4000) }),
  async ({ enquiryId, body }, user) => {
    await addEnquiryNote(enquiryId, body, user.id);
    return { status: "success", message: "Note added." };
  },
);

// datetime-local inputs carry no zone; staff enter times in IST.
const istDateTime = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = new Date(`${v.length === 16 ? `${v}:00` : v}+05:30`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time." });
      return z.NEVER;
    }
    return date;
  });

export const updateHandlingAction = adminAction(
  "STAFF",
  z.object({ enquiryId: id, assigneeId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null), followUpAt: istDateTime }),
  async ({ enquiryId, assigneeId, followUpAt }, user) => {
    await updateEnquiryHandling(enquiryId, { assigneeId, followUpAt }, user.id);
    return { status: "success", message: "Saved." };
  },
);

export const archiveAction = adminAction(
  "STAFF",
  z.object({ enquiryId: id, archived: z.enum(["true", "false"]) }),
  async ({ enquiryId, archived }, user) => {
    await setEnquiryArchived(enquiryId, archived === "true", user.id);
    return { status: "success", message: archived === "true" ? "Enquiry archived." : "Enquiry restored." };
  },
);

export const deleteEnquiryAction = adminAction("ADMIN", z.object({ enquiryId: id }), async ({ enquiryId }, user) => {
  const reference = await deleteEnquiry(enquiryId, user.id);
  return { status: "success", message: `Enquiry ${reference} was permanently deleted.`, redirectTo: "/admin/enquiries" };
});

export const retryEmailAction = adminAction("STAFF", z.object({ deliveryId: id }), async ({ deliveryId }, user) => {
  const row = await retryDelivery(deliveryId);
  if (!row) throw new UserFacingError("This email has already been sent or is being sent.");
  await audit({ actorId: user.id, action: "email.retry_requested", entityType: "EmailDelivery", entityId: deliveryId });
  after(kickOutbox);
  return { status: "success", message: "Queued for another attempt. Refresh in a moment to see the result." };
});

export const cancelEmailAction = adminAction("STAFF", z.object({ deliveryId: id }), async ({ deliveryId }, user) => {
  if (!(await cancelDelivery(deliveryId))) throw new UserFacingError("Only queued or failed emails can be cancelled.");
  await audit({ actorId: user.id, action: "email.cancelled", entityType: "EmailDelivery", entityId: deliveryId });
  return { status: "success", message: "Email cancelled." };
});
