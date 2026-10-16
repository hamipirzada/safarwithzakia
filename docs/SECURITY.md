# Security and privacy

This describes the controls in place. It is not a legal compliance statement: the privacy and policy pages still need review for the business and applicable law (ASSUMPTIONS A-10).

## Authentication
- Better Auth email + password. **Public sign-up is disabled.** Accounts are created by an admin (Admin → Staff) or via `npm run admin:create`.
- Passwords: 12–128 characters, hashed with scrypt (Better Auth default), never logged. Temporary passwords are shown once.
- Sessions: database-backed, 12-hour expiry, `HttpOnly`, `SameSite=Lax`, `Secure` when `APP_URL` is https, cookie prefix `swz`.
- Login and password-reset throttling (database storage, shared across instances): sign-in 10 per 15 min, reset requests 5 per hour, per IP.
- Password reset: one-hour single-use token, the same response whether or not the account exists, all sessions revoked on reset, and the email goes through the outbox.
- Deactivated staff are refused at sign-in (session-creation hook) and on every request (`getCurrentStaff` re-reads `active` and `role` from the database).

## Authorisation
- Two roles, least privilege: **STAFF** (enquiries, catalogue, content) and **ADMIN** (plus staff, business details, Gmail, CSV export, enquiry deletion, audit log).
- Enforced on the server in every admin page (`requireStaffPage`), every admin server action (`adminAction` wrapper: authorise → validate → act) and every admin route handler (`requireStaff`). Hiding navigation links is cosmetic only.
- `src/proxy.ts` only redirects requests without a session cookie; it is not relied on for security.
- Nothing is exported from `"use server"` files without going through `adminAction` (public actions are the enquiry, estimate and track actions only).
- Safeguards: you cannot demote or deactivate yourself, and the last active admin cannot be removed.
- Sensitive actions are written to `audit_log` (status changes, edits, publishing, exports, deletions, staff changes, Gmail connect/disconnect, email retries).

## Input handling
- Every public form is validated on the server with zod (`src/domain/schemas.ts`). Browser validation is a convenience only.
- Single-line fields reject control characters (including CR/LF). Multi-line fields have control characters stripped.
- Prices sent by the browser are ignored; the server re-prices from database rules.
- Database access goes only through Prisma (parameterised). The few raw SQL statements (throttle upsert, outbox claim/recovery, status-change row lock) use tagged templates, so values are parameterised; the test-only TRUNCATE helpers refuse to run unless the database name contains "test"/"e2e".
- React escapes all rendered output. The only `dangerouslySetInnerHTML` is JSON-LD built from settings, with `<` escaped.
- CSV export neutralises spreadsheet formulas (`=`, `+`, `-`, `@`).
- No file uploads (no upload attack surface).

## Email safety
- Recipients are never taken from form input except the customer's own validated address (acknowledgement To, internal Reply-To). Business recipients come from settings or environment.
- The MIME builder rejects CR/LF or control characters in any header, accepts only single plain addresses, and RFC 2047-encodes non-ASCII subjects and names.
- Every dynamic value in HTML email is HTML-escaped. Plain-text alternatives are always included.
- Gmail scope is `gmail.send` only (no mailbox read access). The refresh token is stored server-side only, encrypted with AES-256-GCM (key derived from `AUTH_SECRET` via HKDF), and never sent to the browser. The OAuth flow uses a random `state` in an HttpOnly cookie compared in constant time, and the callback also requires an admin session.

## Abuse protection
- Database-backed throttles: 5 submissions per IP per 10 min, 5 per email per hour, 60 estimates per minute, 10 status lookups per 10 minutes.
- Honeypot field and minimum fill time. Flagged submissions are kept as SPAM (no emails) for review, never silently discarded.
- Duplicate submissions are de-duplicated by a per-form `submissionKey`.
- **Client IP trust:** with `TRUST_PROXY_HEADERS=true` the IP comes from `X-Forwarded-For`/`X-Real-IP`. Only run like this behind a proxy that overwrites those headers. If the app is exposed directly, set it to `false`; the IP limit is then skipped and the per-email limit still applies. IPs are stored only as an HMAC (`ipHash`).
- The status lookup needs the reference **and** the email, returns only a status phrase, and gives the same error for any mismatch.
- No CAPTCHA (no third-party service approved). Add one (e.g. Cloudflare Turnstile) if automated abuse appears.

## HTTP headers
Set for every response in `next.config.ts`: Content-Security-Policy (self-only scripts, styles, images, fonts, connections; `frame-ancestors 'none'`; `form-action 'self'`; `object-src 'none'`; `upgrade-insecure-requests` in production), HSTS (production, 2 years, includeSubDomains), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and `Cross-Origin-Opener-Policy: same-origin`. The `X-Powered-By` header is removed. Admin pages add `noindex` and `no-store`.
*Known gap:* `script-src` includes `'unsafe-inline'` because Next.js inlines bootstrap scripts. Nonce-based CSP is possible but forces fully dynamic rendering of every page. Zod runs in jitless mode so no `eval` is needed.

## CSRF and redirects
Server Actions are POST-only and Next.js checks the Origin header against the host. Better Auth validates origins against `trustedOrigins` (`APP_URL`). Session cookies are `SameSite=Lax`. Post-login redirects accept only `/admin…` paths (`safeAdminRedirect`). Announcement links accept internal paths only, and social/map links must be `https://`.

## Secrets and configuration
All secrets come from environment variables or the host's secret store. `.env*` files are git-ignored (`.env.example` contains placeholders only). Configuration is validated at start-up, and errors name variables without printing values. The logger redacts token-like strings and the code avoids logging customer PII (names, emails, phones, messages); logs use ids and references instead. Test-only Google endpoint overrides accept loopback URLs only.

## Database
- Use a dedicated database user that owns only the application database (no superuser). Example:
  ```sql
  CREATE ROLE safar_app LOGIN PASSWORD '…';
  CREATE DATABASE safar OWNER safar_app;
  ```
  (Migrations need DDL rights on that database; split migration and runtime users if your policy requires it.)
- Require TLS for remote connections (`sslmode=require`).
- Constraints protect integrity even against buggy code: single pricing owner, non-negative money, valid seasons, consent before publishing testimonials, traveller counts, estimate consistency.

## Privacy
- Data collected and why: see `/privacy` (describes actual behaviour). There are no analytics or advertising cookies. The trip builder stores an unsent draft in `sessionStorage` only.
- No payment or card data is collected.
- Retention and deletion: OPERATIONS.md, and ASSUMPTIONS A-11 for the decision still needed.
- Backups contain personal data: encrypt them and restrict access.

## Reporting
Report suspected vulnerabilities privately to the site administrator (business email in Admin → Business details).
