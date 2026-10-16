# Technical decisions

Short records of the significant choices, why they were made, and what they cost.

### TD-01 Stack: Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS 4
The project was empty and the requested default stack fits. Versions current on 16 Oct 2026: Next 16.4.2, React 19.3, TypeScript 5 (Next does not yet support TypeScript 7), Tailwind 4.3. Strictness is extended with `noUncheckedIndexedAccess`. **Node 22 LTS** is required (Next 16 needs ≥ 20.9). `.nvmrc` pins 22.

### TD-02 PostgreSQL + Prisma ORM 7.10 (driver adapter `@prisma/adapter-pg`)
Prisma 8 is still a release candidate (its npm `latest` tag points at an RC), so the stable 7.x line is pinned. Migrations in `prisma/migrations` are the source of truth. Constraints Prisma cannot express (single pricing-rule owner, non-negative money, valid seasons, consent before publishing testimonials, estimate consistency) are added as SQL `CHECK` constraints in the initial migration. The client is created lazily, so builds need no database.

### TD-03 Authentication: Better Auth 1.7 (email + password, database sessions)
A maintained library with Prisma support, scrypt password hashing, database-backed rate limiting, HTTP-only cookies, `disableSignUp` and password-reset hooks. Auth.js was rejected because its credentials provider forces JWT sessions and is discouraged by its maintainers. Sessions are re-checked against the `active` flag and role on every request (`src/server/authz.ts`), so deactivation and role changes apply immediately.

### TD-04 Cache Components turned off; DB-backed routes render per request
Next 16 enables Cache Components by default, which prerenders a static shell and needs `use cache` + tag invalidation for fresh data. For a small catalogue edited by staff, that adds build-time DB access and invalidation bugs for little gain. Every public page reads live data (`dynamic = "force-dynamic"` on the route-group layouts), so admin edits appear immediately. *Cost:* each page view queries the database (a few indexed queries, which is fine at this scale). Static assets and optimised images are still cached. This can be revisited if traffic grows.

### TD-05 Pricing as a pure domain module with explicit bases
`src/domain/pricing.ts` has no I/O. Every amount carries a basis (`PER_PERSON`, `PER_GROUP`, `PER_PERSON_PER_DAY`, `PER_GROUP_PER_DAY`, `PER_PACKAGE`). Days are priced individually against seasonal and validity rules, so stays that cross a season boundary are correct. Anything missing (rate, child rate, exact date for seasonal rates, a group size different from a package's) gives `QUOTE_REQUIRED` with reasons, never a guess. Money is integer paise. The browser only *displays* server estimates; submissions are always re-priced on the server.

### TD-06 Email: direct Gmail REST API + durable database outbox
- `fetch` calls to `oauth2.googleapis.com/token` and `gmail.googleapis.com/.../messages/send`, instead of the ~100 MB `googleapis` package.
- Only the `gmail.send` scope (plus `openid email` at connect time, to record which address was authorised). There is no mailbox read access.
- Two ways to authorise: (a) an admin clicks "Connect Gmail" (server-side OAuth code flow with a state cookie; the refresh token is stored AES-256-GCM encrypted with a key derived from `AUTH_SECRET`), or (b) `GMAIL_REFRESH_TOKEN` in the environment.
- **Outbox:** rows are written in the same transaction as the enquiry, with a unique idempotency key per enquiry and kind. Workers claim rows with `FOR UPDATE SKIP LOCKED` and a lease, and post-send updates are fenced on the lease. Bounded retries back off at 1 m, 5 m, 15 m, 1 h and 3 h (6 attempts by default).
- An interrupted send has an unknown outcome and is never re-sent automatically. It becomes FAILED (`UNKNOWN_OUTCOME`) for a human to check, which avoids duplicate emails without needing mailbox read access.
- Revoked consent (`invalid_grant`) marks the credential REVOKED and returns messages to the queue without counting attempts.
- Rendered content is stored on the row, so retries send exactly what was queued.

### TD-07 3D hero: CSS 3D ring instead of Three.js
The reference's 3D scene is decorative (torus knot plus orbiting photos, some not of Kashmir). A draggable CSS-3D ring of real destination photos gives the same "rotate to explore" interaction, with keyboard and touch support, reduced-motion handling and pausing when off-screen. It downloads no WebGL library (about 600 KB saved), and every card links to a real page. A genuine 3D terrain model would need source data and art direction that do not exist yet.

### TD-08 Visual direction
The reference identity (deep navy + saffron gold) is kept and refined into an editorial palette: warm paper `#f6f2ea`, slate ink `#16212c`, a single saffron accent `#c8921d` used sparingly, Dal Lake teal for focus and links. Type: **Fraunces** (variable display serif with optical sizing) and **Instrument Sans**, self-hosted through `next/font`. Square-ish corners (2–6 px), hairline rules, asymmetric editorial grids, numbered process lists instead of icon grids, and no emoji or gradient blobs. Photography is credited.

### TD-09 Images: local, licensed, manifest-driven
Fourteen Wikimedia Commons photographs (CC BY / CC BY-SA), resized to 2000 px with metadata stripped, live in `public/images`. `src/content/images.ts` is the single manifest (alt text, size, credit, licence, source), seeded as `MediaAsset` rows that the admin picks from. `next/image` serves AVIF/WebP at responsive sizes. There are **no uploads** in v1: serverless file systems are ephemeral and object storage was not requested. Adding photos is a documented developer task (OPERATIONS.md).

### TD-10 Rate limiting and spam
A database-backed fixed-window throttle (`request_throttle`) works across serverless instances: 5 submissions per IP per 10 minutes and 5 per email per hour (both configurable), 60 estimates per minute, 10 status lookups per 10 minutes. There is a honeypot field (named so browsers will not autofill it) and a 2.5-second time-trap. Flagged submissions are **saved as SPAM** (no emails) rather than silently dropped, so a misclassified customer is never lost. No CAPTCHA, because no third-party service was approved; this can be added if abuse appears. When no trustworthy client IP exists, the IP limit is skipped rather than using one shared bucket that a single abuser could exhaust.

### TD-11 Duplicate-submission protection
The submit button is disabled while sending, and each form instance has a random `submissionKey` (unique column), so a repeated or raced submission returns the original reference.

### TD-12 Background work
- `after()` processes the outbox right after a submission (best effort).
- `/api/cron/email-outbox` (bearer secret) for schedulers: Vercel Cron, GitHub Actions, or a `curl` loop in Docker Compose.
- `npm run worker:email` as a long-running alternative.
All three can run together safely.

### TD-13 Settings as validated JSON rows
Business details, home/about content, the announcement banner and email settings live in `site_setting` (key → JSON), each with a zod schema and defaults (the reference content). This is simpler than a table per block, and validation stops malformed content from reaching pages.

### TD-14 Table consolidation (vs. the suggested entity list)
- `AdminUser` → `User` (only staff accounts exist), plus Better Auth's `Session`, `Account`, `Verification` and `RateLimit`.
- `PackageInclusion` + `PackageExclusion` → `PackageFeature(kind)`.
- `DestinationImage` / `PackageImage` → join tables to a shared `MediaAsset`.
- Added `Offer`, `GmailCredential`, `RequestThrottle`.
- `EnquiryDestination` stores `nameSnapshot`, and `Enquiry.snapshot` stores the full original submission and estimate, so later catalogue edits never rewrite history.

### TD-15 Promo codes are not "redeemed" by enquiries
An enquiry is not a sale, so codes have validity windows and minimums but no redemption counter. Staff confirm the discount when quoting.

### TD-16 Status lookup replaces phone tracking
The reference's phone-only lookup could expose other people's data. `/track` needs the reference **and** the email, returns only a public status phrase, gives a generic message on failure, and is throttled.

### TD-17 Testing
Vitest 5 with two projects: **unit** (pure domain and rendering logic) and **integration** (real PostgreSQL `safar_test`, truncated between tests). Playwright 1.64 runs against a production build with a dedicated `safar_e2e` database and a loopback stand-in for Google's endpoints (`scripts/test/google-stub.mjs`). Test-only endpoint overrides accept loopback URLs only.
