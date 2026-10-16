import "server-only";
import { z } from "zod";

/**
 * Server configuration, validated once on first use and at server start-up
 * (see src/instrumentation.ts). Error messages name variables but never print values.
 */

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const loopbackUrl = optional.refine(
  (v) => v === undefined || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(v),
  "Test endpoint overrides may only point at a loopback address",
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.url("APP_URL must be the public origin, e.g. https://safarwithzakiya.in"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters (generate with: openssl rand -base64 48)"),
  EMAIL_WORKER_SECRET: optional.refine((v) => v === undefined || v.length >= 24, "EMAIL_WORKER_SECRET must be at least 24 characters"),
  ENQUIRY_RECIPIENT_EMAIL: optional.pipe(z.email().optional()),
  GMAIL_CLIENT_ID: optional,
  GMAIL_CLIENT_SECRET: optional,
  GMAIL_REDIRECT_URI: optional.pipe(z.url().optional()),
  GMAIL_REFRESH_TOKEN: optional,
  GMAIL_SENDER_ADDRESS: optional.pipe(z.email().optional()),
  /** When "true" (default), the client IP is read from X-Forwarded-For / X-Real-IP set by the hosting proxy. */
  TRUST_PROXY_HEADERS: z.enum(["true", "false"]).default("true"),
  /** Automated tests only: point Google OAuth/Gmail calls at a local stub. Loopback URLs only. */
  TEST_GOOGLE_OAUTH_BASE_URL: loopbackUrl,
  TEST_GMAIL_API_BASE_URL: loopbackUrl,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server configuration:\n${problems}\nSee .env.example and docs/DEPLOYMENT.md.`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}
