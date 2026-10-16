import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { audit } from "./audit";
import { prisma } from "./db";
import { getEnv } from "./env";
import { log } from "./logger";
import { getSetting } from "./settings";
import { enqueueEmail, kickOutbox } from "./email/outbox";
import { renderPasswordReset } from "./email/templates";

const RESET_TOKEN_SECONDS = 60 * 60;

function createAuth() {
  const env = getEnv();
  const secureCookies = env.APP_URL.startsWith("https://");

  return betterAuth({
    appName: "Safar With Zakia admin",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),

    emailAndPassword: {
      enabled: true,
      // No public registration. Staff accounts are created by an administrator or the
      // bootstrap script (npm run admin:create).
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
      async sendResetPassword({ user, url }) {
        // Queued through the outbox like every other email; never blocks or reveals whether
        // the account exists (Better Auth returns the same response either way).
        const business = await getSetting("business");
        await enqueueEmail({
          idempotencyKey: `password-reset:${user.id}:${Date.now()}`,
          kind: "PASSWORD_RESET",
          to: user.email,
          rendered: renderPasswordReset({ businessName: business.name, name: user.name, url, expiresMinutes: RESET_TOKEN_SECONDS / 60 }),
          expiresAt: new Date(Date.now() + RESET_TOKEN_SECONDS * 1000),
        });
        void kickOutbox();
        log.info("auth.password_reset_requested", { userId: user.id });
      },
    },

    user: {
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "STAFF" },
        active: { type: "boolean", input: false, defaultValue: true },
      },
    },

    session: {
      expiresIn: 60 * 60 * 12, // 12 hours
      updateAge: 60 * 60, // refresh expiry at most hourly
    },

    databaseHooks: {
      session: {
        create: {
          // Deactivated staff cannot sign in.
          async before(session) {
            const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { active: true } });
            if (!user?.active) {
              log.warn("auth.inactive_user_sign_in_blocked", { userId: session.userId });
              return false;
            }
          },
        },
      },
    },

    rateLimit: {
      enabled: env.NODE_ENV !== "test" || process.env.AUTH_RATE_LIMIT === "on",
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 15 * 60, max: 10 },
        "/request-password-reset": { window: 60 * 60, max: 5 },
        "/reset-password": { window: 15 * 60, max: 10 },
      },
    },

    advanced: {
      cookiePrefix: "swz",
      useSecureCookies: secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: secureCookies },
      database: { generateId: "uuid" },
      ipAddress: {
        ipAddressHeaders: env.TRUST_PROXY_HEADERS === "true" ? ["x-forwarded-for", "x-real-ip"] : [],
      },
    },

    hooks: {
      // Record self-service password changes (made through Better Auth's endpoint) in the audit log.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/change-password" || ctx.context.returned instanceof APIError) return;
        const userId = (ctx.context.returned as { user?: { id?: string } } | undefined)?.user?.id;
        if (userId) await audit({ actorId: userId, action: "staff.password_changed", entityType: "User", entityId: userId });
      }),
    },

    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { auth?: Auth };

/** Lazily constructed so builds and tooling do not need runtime configuration. */
export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
