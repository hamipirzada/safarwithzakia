/**
 * Create the first administrator (or reset a staff password) from the command line.
 * There is no public registration; this script and the admin "Staff" page are the only
 * ways accounts are created.
 *
 *   npm run admin:create -- --email owner@example.com --name "Zakia"
 *   npm run admin:create -- --email owner@example.com --reset-password
 *
 * The password is read from ADMIN_PASSWORD if set; otherwise a strong one is generated and
 * printed once. Change it after first sign-in via "Forgot password" or ask another admin.
 */

import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "ADMIN" },
    "reset-password": { type: "boolean", default: false },
  },
});

async function main(): Promise<void> {
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Pass a valid --email");
  const role = values.role === "STAFF" ? "STAFF" : "ADMIN";

  const password = process.env.ADMIN_PASSWORD || randomBytes(15).toString("base64url");
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  const hash = await hashPassword(password);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (!values["reset-password"]) throw new Error(`${email} already exists. Use --reset-password to set a new password.`);
      await prisma.$transaction([
        prisma.account.updateMany({ where: { userId: existing.id, providerId: "credential" }, data: { password: hash } }),
        prisma.session.deleteMany({ where: { userId: existing.id } }),
        prisma.auditLog.create({ data: { action: "staff.password_reset_cli", entityType: "User", entityId: existing.id } }),
      ]);
      console.log(`Password reset for ${email}. All existing sessions were signed out.`);
    } else {
      const name = values.name?.trim();
      if (!name) throw new Error("Pass --name for a new account");
      const id = randomUUID();
      await prisma.$transaction([
        prisma.user.create({ data: { id, email, name, role, emailVerified: true } }),
        prisma.account.create({ data: { userId: id, accountId: id, providerId: "credential", password: hash } }),
        prisma.auditLog.create({ data: { action: "staff.created_cli", entityType: "User", entityId: id, metadata: { role } } }),
      ]);
      console.log(`Created ${role} account for ${email}.`);
    }

    if (!process.env.ADMIN_PASSWORD) {
      console.log(`\nTemporary password (shown once): ${password}\nSign in at /admin/login and change it.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
