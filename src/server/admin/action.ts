import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { fieldErrors } from "@/domain/schemas";
import type { ActionState } from "@/lib/action-state";
import { AuthorizationError, requireStaff, type StaffUser } from "../authz";
import { errorMessage, log } from "../logger";

export class UserFacingError extends Error {}

/**
 * Wraps an admin server action: authorises the caller (on every call, server-side), validates
 * input with zod, converts known failures into form messages, and logs unexpected errors.
 */
export function adminAction<S extends z.ZodType>(
  minimumRole: Role,
  schema: S,
  handler: (input: z.output<S>, user: StaffUser) => Promise<ActionState>,
) {
  return async (_previous: ActionState, formData: FormData): Promise<ActionState> => {
    let user: StaffUser;
    try {
      user = await requireStaff(minimumRole);
    } catch (error) {
      if (error instanceof AuthorizationError) return { status: "error", message: error.message };
      // e.g. database unreachable while checking the session: fail closed with a clear message.
      log.error("admin.authorisation_check_failed", { error: errorMessage(error) });
      return { status: "error", message: "The server could not verify your session right now. Nothing was saved. Please try again." };
    }

    const raw = formData.has("payload") ? safeJson(formData.get("payload")) : Object.fromEntries(formData);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", message: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
    }

    try {
      return await handler(parsed.data, user);
    } catch (error) {
      if (error instanceof UserFacingError) return { status: "error", message: error.message };
      if (isUniqueViolation(error)) return { status: "error", message: "That value is already in use (for example a slug or code). Please choose another." };
      log.error("admin.action_failed", { userId: user.id, error: errorMessage(error) });
      return { status: "error", message: "Something went wrong and nothing was saved. Please try again." };
    }
  };
}

function safeJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Form helpers for zod schemas fed from FormData. */
export const formText = (max: number) => z.string().trim().max(max);
export const formOptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
/** An HTML checkbox: browsers omit unchecked boxes entirely, so a missing key means false. */
export const formCheckbox = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.boolean()])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === true);
