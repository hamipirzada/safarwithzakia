import { ENQUIRY_STATUSES } from "@/domain/enquiry-status";
import type { EnquiryStatus, EnquiryType } from "@/generated/prisma/enums";
import { audit } from "@/server/audit";
import { AuthorizationError, requireStaff } from "@/server/authz";
import { exportEnquiriesCsv, receivedDate, type EnquiryFilters } from "@/server/enquiries/admin";

export const dynamic = "force-dynamic";

/** CSV export of the filtered enquiry list. Administrators only; every export is audited. */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireStaff("ADMIN");
  } catch (error) {
    if (error instanceof AuthorizationError) return new Response(error.message, { status: error.reason === "UNAUTHENTICATED" ? 401 : 403 });
    throw error;
  }
  const params = new URL(request.url).searchParams;
  const status = params.get("status") as EnquiryStatus | null;
  const view = params.get("view");
  const filters: EnquiryFilters = {
    q: params.get("q") ?? undefined,
    status: status && ENQUIRY_STATUSES.includes(status) ? status : undefined,
    type: (["CONTACT", "PACKAGE", "CUSTOM_TRIP"] as const).find((t) => t === params.get("type")) as EnquiryType | undefined,
    view: view === "open" || view === "due" || view === "archived" ? view : undefined,
    assignee: params.get("assignee") === "me" ? user.id : params.get("assignee") === "none" ? "none" : undefined,
    receivedFrom: receivedDate(params.get("from")),
    receivedTo: receivedDate(params.get("to")),
  };
  const { csv, count } = await exportEnquiriesCsv(filters);
  await audit({ actorId: user.id, action: "enquiry.exported", entityType: "Enquiry", metadata: { count, filters: JSON.parse(JSON.stringify(filters)) } });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="enquiries-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
