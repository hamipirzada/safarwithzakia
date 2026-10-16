// Local test double for Google's OAuth token endpoint and the Gmail send API.
// Used only by automated tests (TEST_GOOGLE_OAUTH_BASE_URL / TEST_GMAIL_API_BASE_URL, loopback only).
// It records messages instead of delivering them — passing tests prove our integration logic,
// not real delivery. See docs/TESTING.md for the real-mailbox test procedure.
//
//   node scripts/test/google-stub.mjs 3199
import { createServer } from "node:http";

export function startGoogleStub(port) {
  const state = { failNext: 0, messages: [], tokenRequests: 0 };

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const json = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/__health") return json(200, { ok: true });
    if (url.pathname === "/__messages") return json(200, state.messages);
    if (url.pathname === "/__control" && req.method === "POST") {
      Object.assign(state, JSON.parse(body || "{}"));
      if (JSON.parse(body || "{}").reset) state.messages = [];
      return json(200, { failNext: state.failNext });
    }

    if (url.pathname === "/token" && req.method === "POST") {
      state.tokenRequests++;
      const form = new URLSearchParams(body);
      if (form.get("client_id") !== "stub-client" || form.get("client_secret") !== "stub-secret") return json(401, { error: "invalid_client" });
      if (form.get("grant_type") === "refresh_token") {
        if (form.get("refresh_token") === "revoked") return json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        return json(200, { access_token: `ya29.stub-${state.tokenRequests}`, expires_in: 3599, token_type: "Bearer" });
      }
      if (form.get("grant_type") === "authorization_code") {
        const idPayload = Buffer.from(JSON.stringify({ email: "bookings@example.test", email_verified: true })).toString("base64url");
        return json(200, { access_token: "ya29.stub", refresh_token: "stub-refresh", expires_in: 3599, scope: "https://www.googleapis.com/auth/gmail.send openid https://www.googleapis.com/auth/userinfo.email", id_token: `e30.${idPayload}.sig` });
      }
      return json(400, { error: "unsupported_grant_type" });
    }

    if (url.pathname === "/gmail/v1/users/me/messages/send" && req.method === "POST") {
      if (!req.headers.authorization?.startsWith("Bearer ya29.")) return json(401, { error: { status: "UNAUTHENTICATED", message: "Invalid credentials" } });
      if (state.failNext > 0) {
        state.failNext--;
        return json(503, { error: { code: 503, status: "UNAVAILABLE", message: "Backend error", errors: [{ reason: "backendError" }] } });
      }
      const raw = Buffer.from(JSON.parse(body).raw, "base64url").toString("utf8");
      const header = (name) => raw.match(new RegExp(`^${name}: (.*)$`, "mi"))?.[1] ?? null;
      const id = `stub-${state.messages.length + 1}`;
      state.messages.push({ id, to: header("To"), from: header("From"), replyTo: header("Reply-To"), subject: header("Subject"), raw });
      return json(200, { id, threadId: id, labelIds: ["SENT"] });
    }

    json(404, { error: "not found" });
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, state, close: () => new Promise((r) => server.close(r)) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 3199);
  await startGoogleStub(port);
  console.log(`google stub listening on http://127.0.0.1:${port}`);
}
