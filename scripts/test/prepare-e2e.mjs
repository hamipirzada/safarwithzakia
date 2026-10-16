// Prepares the dedicated end-to-end database: applies migrations (non-destructive), clears
// rows left by the previous run, seeds, and creates test staff accounts.
// Refuses to run unless the database name ends in "_e2e".
import { execSync } from "node:child_process";
import pg from "pg";

const url = process.env.DATABASE_URL ?? "";
const dbName = new URL(url).pathname.slice(1);
if (!dbName.endsWith("_e2e")) throw new Error(`prepare-e2e refused: database "${dbName}" is not an e2e database`);

const run = (cmd, extraEnv = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
run("npx prisma migrate deploy");

const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);

run("npx prisma db seed");
run("npx tsx scripts/create-admin.ts --email admin@e2e.test --name E2E-Admin", { ADMIN_PASSWORD: "e2e-admin-password-1" });
run("npx tsx scripts/create-admin.ts --email staff@e2e.test --name E2E-Staff --role STAFF", { ADMIN_PASSWORD: "e2e-staff-password-1" });

// Test fixture only: confirm the Srinagar and Gulmarg rates so the estimate path is exercised.
// (In the real seed these stay inactive until the business confirms their basis.)
await client.query(`UPDATE pricing_rule SET active = true, "childAmountPaise" = 1500 * 100
  WHERE "destinationId" IN (SELECT id FROM destination WHERE slug IN ('srinagar-dal-lake', 'gulmarg'))`);
await client.end();
console.log("e2e database ready");
