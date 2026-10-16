import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "./db";

/** Record a sensitive staff action. Metadata must not contain customer PII or secrets. */
export async function audit(
  entry: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  tx: Tx = prisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
    },
  });
}
