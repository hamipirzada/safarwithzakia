import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PORT = 3298;
process.env.TEST_GOOGLE_OAUTH_BASE_URL = `http://127.0.0.1:${PORT}`;
process.env.TEST_GMAIL_API_BASE_URL = `http://127.0.0.1:${PORT}`;
process.env.GMAIL_CLIENT_ID = "stub-client";
process.env.GMAIL_CLIENT_SECRET = "stub-secret";
process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/api/admin/gmail/callback";

// The route handlers read the session from headers and the OAuth state from cookies.
const requestHeaders = { current: new Headers() };
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (opts: string | { name: string }) => void jar.delete(typeof opts === "string" ? opts : opts.name),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  }),
}));

const { startGoogleStub } = await import("../../scripts/test/google-stub.mjs");
const { hashPassword } = await import("better-auth/crypto");
const { prisma } = await import("@/server/db");
const { getAuth } = await import("@/server/auth");
const { decryptSecret } = await import("@/server/email/token-crypto");
const connect = await import("@/app/api/admin/gmail/connect/route");
const callback = await import("@/app/api/admin/gmail/callback/route");
const { resetDatabase } = await import("../support/db");

let stub: Awaited<ReturnType<typeof startGoogleStub>>;
beforeAll(async () => {
  stub = await startGoogleStub(PORT);
});
afterAll(() => stub.close());

async function signInAs(email: string, role: "ADMIN" | "STAFF") {
  const user = await prisma.user.create({ data: { name: role, email, role, emailVerified: true } });
  await prisma.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword("correct-horse-battery") } });
  const { headers } = await getAuth().api.signInEmail({ body: { email, password: "correct-horse-battery" }, returnHeaders: true });
  requestHeaders.current = new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}

beforeEach(async () => {
  await resetDatabase();
  jar.clear();
  requestHeaders.current = new Headers();
});

describe("Gmail OAuth connect flow", () => {
  it("starts consent with a random state, the gmail.send scope and offline access", async () => {
    await signInAs("admin@example.test", "ADMIN");
    const response = await connect.GET(new Request("http://localhost:3000/api/admin/gmail/connect"));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(location.searchParams.get("scope")).not.toContain("gmail.readonly");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("state")).toBe(jar.get("swz_gmail_oauth_state"));
    expect(location.searchParams.get("state")!.length).toBeGreaterThanOrEqual(32);
  });

  it("refuses staff without administrator rights", async () => {
    await signInAs("staff@example.test", "STAFF");
    const response = await connect.GET(new Request("http://localhost:3000/api/admin/gmail/connect"));
    expect(response.headers.get("location")).toContain("/admin/login");
    expect(jar.size).toBe(0);
  });

  it("rejects a callback whose state does not match, storing nothing", async () => {
    await signInAs("admin@example.test", "ADMIN");
    jar.set("swz_gmail_oauth_state", "expected-state-value-0123456789abcdef");
    const response = await callback.GET(new Request("http://localhost:3000/api/admin/gmail/callback?code=abc&state=forged-state-value-0123456789abcdef"));
    expect(response.headers.get("location")).toContain("error=state_mismatch");
    expect(await prisma.gmailCredential.count()).toBe(0);
  });

  it("reports consent being denied", async () => {
    await signInAs("admin@example.test", "ADMIN");
    jar.set("swz_gmail_oauth_state", "s".repeat(32));
    const response = await callback.GET(new Request(`http://localhost:3000/api/admin/gmail/callback?error=access_denied&state=${"s".repeat(32)}`));
    expect(response.headers.get("location")).toContain("error=consent_denied");
  });

  it("stores the refresh token encrypted, never in plain text, and audits the connection", async () => {
    await signInAs("admin@example.test", "ADMIN");
    jar.set("swz_gmail_oauth_state", "t".repeat(32));
    const response = await callback.GET(new Request(`http://localhost:3000/api/admin/gmail/callback?code=good-code&state=${"t".repeat(32)}`));
    expect(response.headers.get("location")).toContain("connected=1");
    const credential = await prisma.gmailCredential.findUniqueOrThrow({ where: { id: "default" } });
    expect(credential).toMatchObject({ senderAddress: "bookings@example.test", status: "ACTIVE" });
    expect(credential.encryptedRefreshToken).not.toContain("stub-refresh");
    expect(decryptSecret(credential.encryptedRefreshToken)).toBe("stub-refresh");
    expect(jar.has("swz_gmail_oauth_state")).toBe(false); // state is single-use
    expect(await prisma.auditLog.count({ where: { action: "email.gmail_connected" } })).toBe(1);
  });
});
