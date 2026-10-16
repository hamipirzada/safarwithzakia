import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build in `.next-e2e` (`npm run test:e2e` builds it) on port 3100, using a
 * separate database (safar_e2e) and a local stand-in for Google's APIs on port 3199.
 * Passing tests do NOT prove real Gmail delivery; see docs/TESTING.md for that procedure.
 */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://safar:safar_dev_pw@127.0.0.1:55433/safar_e2e?schema=public";
const PORT = 3100;
const STUB = "http://127.0.0.1:3199";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: "node scripts/test/google-stub.mjs 3199",
      url: `${STUB}/__health`,
      reuseExistingServer: false,
    },
    {
      command: `node scripts/test/prepare-e2e.mjs && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "production",
        NEXT_DIST_DIR: ".next-e2e",
        DATABASE_URL: E2E_DATABASE_URL,
        APP_URL: `http://localhost:${PORT}`,
        AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnopqrstuv",
        EMAIL_WORKER_SECRET: "e2e-worker-secret-0123456789",
        ENQUIRY_RECIPIENT_EMAIL: "inbox@example.test",
        GMAIL_CLIENT_ID: "stub-client",
        GMAIL_CLIENT_SECRET: "stub-secret",
        GMAIL_REDIRECT_URI: `http://localhost:${PORT}/api/admin/gmail/callback`,
        GMAIL_REFRESH_TOKEN: "e2e-refresh-token",
        GMAIL_SENDER_ADDRESS: "bookings@example.test",
        TEST_GOOGLE_OAUTH_BASE_URL: STUB,
        TEST_GMAIL_API_BASE_URL: STUB,
        ENQUIRY_RATE_LIMIT_PER_IP: "500",
        ENQUIRY_RATE_LIMIT_PER_EMAIL: "500",
      },
    },
  ],
});
