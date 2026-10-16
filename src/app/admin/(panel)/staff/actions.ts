"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { adminAction, UserFacingError } from "@/server/admin/action";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";

const temporaryPassword = () => randomBytes(15).toString("base64url");

export const createStaffAction = adminAction(
  "ADMIN",
  z.object({ name: z.string().trim().min(2, "Enter a name.").max(80), email: z.email("Enter a valid email.").trim().toLowerCase(), role: z.enum(["STAFF", "ADMIN"]) }),
  async ({ name, email, role }, user) => {
    if (await prisma.user.findUnique({ where: { email } })) throw new UserFacingError("A staff account with that email already exists.");
    const password = temporaryPassword();
    const id = randomUUID();
    const hash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id, name, email, role, emailVerified: true } });
      await tx.account.create({ data: { userId: id, accountId: id, providerId: "credential", password: hash } });
      await audit({ actorId: user.id, action: "staff.created", entityType: "User", entityId: id, metadata: { role } }, tx);
    });
    return { status: "success", message: `Account created for ${email}. Temporary password (shown once, share it securely): ${password}` };
  },
);

async function assertNotLastAdmin(targetId: string) {
  const admins = await prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: targetId } } });
  if (admins === 0) throw new UserFacingError("There must always be at least one active administrator.");
}

export const updateStaffAction = adminAction(
  "ADMIN",
  z.object({ userId: z.uuid(), role: z.enum(["STAFF", "ADMIN"]), active: z.enum(["true", "false"]) }),
  async ({ userId, role, active }, user) => {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new UserFacingError("This account no longer exists.");
    const isActive = active === "true";
    if (userId === user.id && (!isActive || role !== "ADMIN")) throw new UserFacingError("You cannot remove your own administrator access or deactivate yourself.");
    if (target.role === "ADMIN" && (role !== "ADMIN" || !isActive)) await assertNotLastAdmin(userId);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { role, active: isActive } });
      if (!isActive) await tx.session.deleteMany({ where: { userId } });
      await audit({ actorId: user.id, action: "staff.updated", entityType: "User", entityId: userId, metadata: { role, active: isActive } }, tx);
    });
    return { status: "success", message: "Account updated." };
  },
);

export const resetStaffPasswordAction = adminAction("ADMIN", z.object({ userId: z.uuid() }), async ({ userId }, user) => {
  // Resetting your own password here would sign you out before the new one could be shown.
  if (userId === user.id) throw new UserFacingError("To change your own password, use My account.");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new UserFacingError("This account no longer exists.");
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: hash } });
    if (updated.count === 0) await tx.account.create({ data: { userId, accountId: userId, providerId: "credential", password: hash } });
    await tx.session.deleteMany({ where: { userId } });
    await audit({ actorId: user.id, action: "staff.password_reset", entityType: "User", entityId: userId }, tx);
  });
  return { status: "success", message: `New temporary password for ${target.email} (shown once): ${password}. Their other sessions were signed out.` };
});
