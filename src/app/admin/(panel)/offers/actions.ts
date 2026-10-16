"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PUBLICATION_STATUSES } from "@/domain/admin-schemas";
import { parseRupeesToPaise } from "@/domain/money";
import { adminAction, formCheckbox, formOptionalText, UserFacingError } from "@/server/admin/action";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";

const optionalId = z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || null);
// <input type="date"> values; offers are valid for whole days in IST.
const dayStart = z.string().trim().optional().transform((v) => (v ? new Date(`${v}T00:00:00+05:30`) : null));
const dayEnd = z.string().trim().optional().transform((v) => (v ? new Date(`${v}T23:59:59+05:30`) : null));

const offerSchema = z
  .object({
    id: optionalId,
    title: z.string().trim().min(3, "Give the offer a title.").max(120),
    description: z.string().trim().min(10, "Describe the offer.").max(1000),
    discountLabel: formOptionalText(40),
    packageId: optionalId,
    promoCodeId: optionalId,
    validFrom: dayStart,
    validTo: dayEnd,
    status: z.enum(PUBLICATION_STATUSES),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .refine((o) => !o.validFrom || !o.validTo || o.validFrom <= o.validTo, { path: ["validTo"], message: "The end date is before the start date." });

export const saveOfferAction = adminAction("STAFF", offerSchema, async ({ id, ...data }, user) => {
  const offer = id ? await prisma.offer.update({ where: { id }, data }) : await prisma.offer.create({ data });
  await audit({ actorId: user.id, action: id ? "offer.updated" : "offer.created", entityType: "Offer", entityId: offer.id, metadata: { status: data.status } });
  revalidatePath("/", "layout");
  return { status: "success", message: id ? "Offer saved." : "Offer created." };
});

export const deleteOfferAction = adminAction("STAFF", z.object({ id: z.uuid() }), async ({ id }, user) => {
  await prisma.offer.delete({ where: { id } });
  await audit({ actorId: user.id, action: "offer.deleted", entityType: "Offer", entityId: id });
  revalidatePath("/", "layout");
  return { status: "success", message: "Offer deleted." };
});

const promoSchema = z
  .object({
    id: optionalId,
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, "Use 3–30 letters, numbers or dashes."),
    description: formOptionalText(200),
    discountType: z.enum(["PERCENT", "FIXED"]),
    value: z.string().trim(),
    minSubtotal: z.string().trim().optional(),
    maxDiscount: z.string().trim().optional(),
    validFrom: dayStart,
    validTo: dayEnd,
    active: formCheckbox,
  })
  .transform((p, ctx) => {
    const money = (raw: string | undefined, path: string) => {
      if (!raw) return null;
      const paise = parseRupeesToPaise(raw);
      if (paise === null) ctx.addIssue({ code: "custom", path: [path], message: "Enter an amount in rupees." });
      return paise;
    };
    let value: number | null;
    if (p.discountType === "PERCENT") {
      value = /^\d{1,3}$/.test(p.value) && Number(p.value) >= 1 && Number(p.value) <= 100 ? Number(p.value) : null;
      if (value === null) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a whole percentage from 1 to 100." });
    } else {
      value = money(p.value, "value");
      if (value === 0) ctx.addIssue({ code: "custom", path: ["value"], message: "The discount must be more than zero." });
    }
    return { ...p, value: value ?? 0, minSubtotalPaise: money(p.minSubtotal, "minSubtotal"), maxDiscountPaise: money(p.maxDiscount, "maxDiscount") };
  });

export const savePromoAction = adminAction("STAFF", promoSchema, async ({ id, minSubtotal: _a, maxDiscount: _b, ...data }, user) => {
  if (data.validFrom && data.validTo && data.validFrom > data.validTo) throw new UserFacingError("The end date is before the start date.");
  const promo = id ? await prisma.promoCode.update({ where: { id }, data }) : await prisma.promoCode.create({ data });
  await audit({ actorId: user.id, action: id ? "promo.updated" : "promo.created", entityType: "PromoCode", entityId: promo.id, metadata: { code: promo.code, active: promo.active } });
  return { status: "success", message: id ? "Promo code saved." : "Promo code created." };
});
