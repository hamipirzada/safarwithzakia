import "server-only";
import type { EnquiryStatus, EnquiryType, Prisma } from "@/generated/prisma/client";
import { canTransition, OPEN_STATUSES, STATUS_LABELS } from "@/domain/enquiry-status";
import { addDays, formatDateTime, isIsoDate, isoDateToUtcDate, utcDateToIsoDate } from "@/domain/dates";
import { audit } from "../audit";
import { UserFacingError } from "../admin/action";
import { prisma } from "../db";

export interface EnquiryFilters {
  q?: string;
  status?: EnquiryStatus;
  type?: EnquiryType;
  view?: "open" | "due" | "archived" | "all";
  assignee?: string; // user id or "me" resolved by caller, or "none"
  /** Inclusive India-time calendar dates (YYYY-MM-DD) the enquiry was received on. */
  receivedFrom?: string;
  receivedTo?: string;
}

/** Keeps a received-date filter only when it is a real ISO date. */
export function receivedDate(value: string | null | undefined): string | undefined {
  return value && isIsoDate(value) ? value : undefined;
}

export function enquiryWhere(filters: EnquiryFilters, now = new Date()): Prisma.EnquiryWhereInput {
  const where: Prisma.EnquiryWhereInput = {};
  if (filters.view === "archived") where.archivedAt = { not: null };
  else where.archivedAt = null;
  if (filters.view === "open") where.status = { in: [...OPEN_STATUSES] };
  if (filters.view === "due") {
    where.status = { in: [...OPEN_STATUSES] };
    where.followUpAt = { lte: now };
  }
  if (filters.status) where.status = filters.status;
  // Spam stays out of default lists unless asked for explicitly.
  if (!filters.status && filters.view !== "archived" && filters.view !== "all") where.NOT = { status: "SPAM" };
  if (filters.type) where.type = filters.type;
  if (filters.assignee === "none") where.assigneeId = null;
  else if (filters.assignee) where.assigneeId = filters.assignee;
  if (filters.receivedFrom || filters.receivedTo) {
    // Midnight IST boundaries, matching the dashboard's India-time days.
    const istMidnight = (d: string) => new Date(isoDateToUtcDate(d).getTime() - 5.5 * 3600 * 1000);
    where.createdAt = {
      ...(filters.receivedFrom ? { gte: istMidnight(filters.receivedFrom) } : {}),
      ...(filters.receivedTo ? { lt: istMidnight(addDays(filters.receivedTo, 1)) } : {}),
    };
  }
  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }
  return where;
}

export async function changeEnquiryStatus(enquiryId: string, to: EnquiryStatus, note: string | null, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Lock the row so two staff members cannot make conflicting transitions at once.
    const rows = await tx.$queryRaw<{ status: EnquiryStatus }[]>`SELECT "status" FROM "enquiry" WHERE "id" = ${enquiryId}::uuid FOR UPDATE`;
    const current = rows[0]?.status;
    if (!current) throw new UserFacingError("This enquiry no longer exists.");
    if (current === to) return;
    if (!canTransition(current, to)) {
      throw new UserFacingError(`An enquiry cannot move from “${STATUS_LABELS[current]}” to “${STATUS_LABELS[to]}”.`);
    }
    await tx.enquiry.update({ where: { id: enquiryId }, data: { status: to } });
    await tx.enquiryStatusHistory.create({ data: { enquiryId, fromStatus: current, toStatus: to, changedById: actorId, note } });
    await audit({ actorId, action: "enquiry.status_changed", entityType: "Enquiry", entityId: enquiryId, metadata: { from: current, to } }, tx);
  });
}

export async function addEnquiryNote(enquiryId: string, body: string, actorId: string): Promise<void> {
  await prisma.enquiryNote.create({ data: { enquiryId, body, authorId: actorId } });
}

export async function updateEnquiryHandling(
  enquiryId: string,
  data: { assigneeId: string | null; followUpAt: Date | null },
  actorId: string,
): Promise<void> {
  if (data.assigneeId) {
    const assignee = await prisma.user.findFirst({ where: { id: data.assigneeId, active: true }, select: { id: true } });
    if (!assignee) throw new UserFacingError("That staff member cannot be assigned.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.enquiry.update({ where: { id: enquiryId }, data });
    await audit({ actorId, action: "enquiry.handling_updated", entityType: "Enquiry", entityId: enquiryId, metadata: { assigneeId: data.assigneeId, followUpAt: data.followUpAt?.toISOString() ?? null } }, tx);
  });
}

export async function setEnquiryArchived(enquiryId: string, archived: boolean, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.enquiry.update({ where: { id: enquiryId }, data: { archivedAt: archived ? new Date() : null } });
    await audit({ actorId, action: archived ? "enquiry.archived" : "enquiry.unarchived", entityType: "Enquiry", entityId: enquiryId }, tx);
  });
}

/** Permanent deletion (administrators only, enforced by the caller). Keeps only an audit trace with the reference. */
export async function deleteEnquiry(enquiryId: string, actorId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const enquiry = await tx.enquiry.findUnique({ where: { id: enquiryId }, select: { reference: true } });
    if (!enquiry) throw new UserFacingError("This enquiry no longer exists.");
    await tx.enquiry.delete({ where: { id: enquiryId } });
    await audit({ actorId, action: "enquiry.deleted", entityType: "Enquiry", entityId: enquiryId, metadata: { reference: enquiry.reference } }, tx);
    return enquiry.reference;
  });
}

// ─── CSV export ──────────────────────────────────────────────────────────────

/** Quote a CSV cell and neutralise spreadsheet formula injection (=, +, -, @, tab, CR). */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportEnquiriesCsv(filters: EnquiryFilters): Promise<{ csv: string; count: number }> {
  const rows = await prisma.enquiry.findMany({
    where: enquiryWhere(filters),
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { package: { select: { title: true } }, destinations: { orderBy: { position: "asc" } }, assignee: { select: { name: true } } },
  });
  const header = ["Reference", "Received", "Type", "Status", "Name", "Email", "Phone", "Package", "Destinations", "Travel start", "Travel month", "Days", "Adults", "Children", "Accommodation", "Transport", "Budget", "Promo code", "Estimate (INR)", "Assigned to", "Follow up", "Message"];
  const lines = rows.map((e) =>
    [
      e.reference,
      formatDateTime(e.createdAt),
      e.type,
      STATUS_LABELS[e.status],
      e.customerName,
      e.email,
      e.phone,
      e.package?.title,
      e.destinations.map((d) => `${d.nameSnapshot} (${d.days}d)`).join("; "),
      e.travelStartDate ? utcDateToIsoDate(e.travelStartDate) : "",
      e.travelMonth,
      e.durationDays,
      e.adults,
      e.children,
      e.accommodationPreference,
      e.transportPreference,
      e.budget,
      e.promoCode,
      e.estimateTotalPaise !== null ? (e.estimateTotalPaise / 100).toFixed(2) : e.estimateStatus === "QUOTE_REQUIRED" ? "Quote required" : "",
      e.assignee?.name,
      e.followUpAt ? formatDateTime(e.followUpAt) : "",
      e.message,
    ]
      .map(csvCell)
      .join(","),
  );
  return { csv: "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n"), count: rows.length };
}
