import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Point the Gmail client at the local stub before any server module reads configuration.
const PORT = 3299;
process.env.TEST_GOOGLE_OAUTH_BASE_URL = `http://127.0.0.1:${PORT}`;
process.env.TEST_GMAIL_API_BASE_URL = `http://127.0.0.1:${PORT}`;
process.env.GMAIL_CLIENT_ID = "stub-client";
process.env.GMAIL_CLIENT_SECRET = "stub-secret";
process.env.GMAIL_REFRESH_TOKEN = "env-refresh-token";
process.env.GMAIL_SENDER_ADDRESS = "bookings@example.test";

const { startGoogleStub } = await import("../../scripts/test/google-stub.mjs");
const { prisma } = await import("@/server/db");
const { clearAccessTokenCache, exchangeAuthorizationCode, GmailError, getAccessToken, sendRawMessage } = await import("@/server/email/gmail");
const { resolveGmailTransport } = await import("@/server/email/config");
const { enqueueEmail, processOutbox } = await import("@/server/email/outbox");
const { encryptSecret } = await import("@/server/email/token-crypto");
const { submitContact } = await import("@/server/enquiries/submit");
const { resetDatabase } = await import("../support/db");

let stub: Awaited<ReturnType<typeof startGoogleStub>>;
beforeAll(async () => {
  stub = await startGoogleStub(PORT);
});
afterAll(() => stub.close());
beforeEach(async () => {
  await resetDatabase();
  clearAccessTokenCache();
  stub.state.messages = [];
  stub.state.failNext = 0;
});

const config = { clientId: "stub-client", clientSecret: "stub-secret", refreshToken: "env-refresh-token" };

describe("Gmail API client (against a local stub)", () => {
  it("exchanges the refresh token and caches the access token", async () => {
    const before = stub.state.tokenRequests;
    const a = await getAccessToken(config);
    const b = await getAccessToken(config);
    expect(a).toMatch(/^ya29\./);
    expect(b).toBe(a);
    expect(stub.state.tokenRequests - before).toBe(1);
  });

  it("classifies revoked consent and bad client credentials", async () => {
    await expect(getAccessToken({ ...config, refreshToken: "revoked" })).rejects.toMatchObject({ kind: "AUTH_REVOKED", code: "invalid_grant" });
    await expect(getAccessToken({ ...config, clientSecret: "wrong", refreshToken: "x" })).rejects.toMatchObject({ kind: "CONFIG", code: "invalid_client" });
  });

  it("classifies Gmail 5xx responses as retryable", async () => {
    stub.state.failNext = 1;
    const error = await sendRawMessage(config, Buffer.from("To: a@example.test\r\n\r\nhi").toString("base64url")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GmailError);
    expect(error).toMatchObject({ kind: "RETRYABLE", code: "backendError" });
  });

  it("parses the authorised mailbox from the code exchange", async () => {
    const result = await exchangeAuthorizationCode({ clientId: "stub-client", clientSecret: "stub-secret", redirectUri: "http://localhost/cb", code: "abc" });
    expect(result).toMatchObject({ refreshToken: "stub-refresh", email: "bookings@example.test" });
    expect(result.scope).toContain("gmail.send");
  });
});

describe("end-to-end delivery through the outbox", () => {
  it("sends the internal notification and the customer acknowledgement for a saved enquiry", async () => {
    const result = await submitContact(
      { name: "Asha <Rao>", email: "asha@example.com", message: "Planning a trip in May.", consent: true, startedAt: Date.now() - 60_000 },
      { ipHash: "x", sourcePage: "/contact" },
    );
    expect(result.ok).toBe(true);
    const summary = await processOutbox();
    expect(summary).toMatchObject({ state: "READY", sent: 2 });

    const internal = stub.state.messages.find((m: { to: string }) => m.to === "inbox@example.test");
    const ack = stub.state.messages.find((m: { to: string }) => m.to === "asha@example.com");
    expect(internal).toBeDefined();
    expect(internal.replyTo).toBe("asha@example.com");
    expect(internal.from).toContain("<bookings@example.test>");
    expect(ack).toBeDefined();
    expect(await prisma.emailDelivery.count({ where: { status: "SENT" } })).toBe(2);
  });

  it("prefers a mailbox connected in the admin over the environment token", async () => {
    await prisma.gmailCredential.create({ data: { id: "default", senderAddress: "connected@example.test", encryptedRefreshToken: encryptSecret("db-token"), scope: "gmail.send" } });
    const resolution = await resolveGmailTransport();
    expect(resolution).toMatchObject({ ok: true, transport: { sender: "connected@example.test", source: "connected" } });
  });

  it("recovers after a revoked connected mailbox is replaced", async () => {
    await prisma.gmailCredential.create({ data: { id: "default", senderAddress: "connected@example.test", encryptedRefreshToken: encryptSecret("revoked"), scope: "gmail.send" } });
    await enqueueEmail({ idempotencyKey: "x", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered: { subject: "S", html: "h", text: "t" } });
    expect(await processOutbox()).toMatchObject({ state: "REVOKED" });
    expect(await resolveGmailTransport()).toMatchObject({ ok: false, state: "REVOKED" });
    expect(await prisma.emailDelivery.findFirstOrThrow()).toMatchObject({ status: "PENDING" });

    await prisma.gmailCredential.update({ where: { id: "default" }, data: { encryptedRefreshToken: encryptSecret("fresh"), status: "ACTIVE" } });
    await prisma.emailDelivery.updateMany({ data: { nextAttemptAt: new Date() } });
    expect(await processOutbox()).toMatchObject({ state: "READY", sent: 1 });
  });
});
