import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Server actions read the session from next/headers; supply the request headers ourselves.
const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined, getAll: () => [] }),
}));

const { hashPassword } = await import("better-auth/crypto");
const { prisma } = await import("@/server/db");
const { getAuth } = await import("@/server/auth");
const { adminAction } = await import("@/server/admin/action");
const { getCurrentStaff } = await import("@/server/authz");
const { resetDatabase } = await import("../support/db");

async function createUser(email: string, role: "ADMIN" | "STAFF", password = "correct-horse-battery") {
  const user = await prisma.user.create({ data: { name: email.split("@")[0]!, email, role, emailVerified: true } });
  await prisma.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword(password) } });
  return user;
}

async function signIn(email: string, password = "correct-horse-battery"): Promise<Headers> {
  const { headers } = await getAuth().api.signInEmail({ body: { email, password }, returnHeaders: true });
  const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return new Headers({ cookie });
}

const action = (role: "ADMIN" | "STAFF") =>
  adminAction(role, z.object({ value: z.string().min(1) }), async ({ value }, user) => ({ status: "success", message: `${user.email}:${value}` }));

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

beforeEach(async () => {
  await resetDatabase();
  requestHeaders.current = new Headers();
});

describe("staff authentication and authorisation", () => {
  it("rejects unauthenticated calls to admin actions", async () => {
    expect(await action("STAFF")({ status: "idle" }, form({ value: "x" }))).toEqual({ status: "error", message: "Please sign in." });
  });

  it("enforces roles on the server", async () => {
    await createUser("staff@example.test", "STAFF");
    requestHeaders.current = await signIn("staff@example.test");
    expect(await action("STAFF")({ status: "idle" }, form({ value: "ok" }))).toEqual({ status: "success", message: "staff@example.test:ok" });
    expect(await action("ADMIN")({ status: "idle" }, form({ value: "ok" }))).toEqual({ status: "error", message: "You do not have permission to do that." });
  });

  it("allows administrators and validates input after authorisation", async () => {
    await createUser("admin@example.test", "ADMIN");
    requestHeaders.current = await signIn("admin@example.test");
    expect(await action("ADMIN")({ status: "idle" }, form({ value: "ok" }))).toMatchObject({ status: "success" });
    expect(await action("ADMIN")({ status: "idle" }, form({ value: "" }))).toMatchObject({ status: "error", fieldErrors: { value: expect.any(String) } });
  });

  it("rejects wrong passwords and has no public sign-up", async () => {
    await createUser("staff@example.test", "STAFF");
    await expect(signIn("staff@example.test", "wrong-password-123")).rejects.toThrow();
    await expect(getAuth().api.signUpEmail({ body: { email: "new@example.test", password: "another-password-1", name: "New" } })).rejects.toThrow();
    expect(await prisma.user.count({ where: { email: "new@example.test" } })).toBe(0);
  });

  it("stores passwords hashed, never in plain text", async () => {
    const user = await createUser("staff@example.test", "STAFF", "correct-horse-battery");
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.password).not.toContain("correct-horse-battery");
  });

  it("blocks deactivated staff immediately, even with an existing session", async () => {
    const user = await createUser("leaver@example.test", "ADMIN");
    requestHeaders.current = await signIn("leaver@example.test");
    expect(await getCurrentStaff()).toMatchObject({ email: "leaver@example.test" });

    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await action("STAFF")({ status: "idle" }, form({ value: "x" }))).toEqual({ status: "error", message: "Please sign in." });
    await expect(signIn("leaver@example.test")).rejects.toThrow();
  });
});
