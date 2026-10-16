import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://safar:safar_dev_pw@127.0.0.1:55433/safar_test?schema=public";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside React Server Components; tests run server code directly.
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/support/integration-global-setup.ts"],
          // One database: run files serially to keep tests independent.
          fileParallelism: false,
          testTimeout: 30_000,
          env: {
            NODE_ENV: "test",
            DATABASE_URL: TEST_DATABASE_URL,
            APP_URL: "http://localhost:3000",
            AUTH_SECRET: "integration-test-secret-0123456789abcdefghijklmnop",
            EMAIL_WORKER_SECRET: "integration-worker-secret-0123456789",
            ENQUIRY_RECIPIENT_EMAIL: "inbox@example.test",
            GMAIL_CLIENT_ID: "",
            GMAIL_CLIENT_SECRET: "",
            GMAIL_REFRESH_TOKEN: "",
            GMAIL_SENDER_ADDRESS: "",
          },
        },
      },
    ],
  },
});
