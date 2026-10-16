# Architecture

## Overview

A single Next.js 16 application serves the public website, the staff admin and a small set of API routes. It talks to one PostgreSQL database. Email goes out through the Gmail API, from a durable outbox processed in the background.

```
Browser ──► Next.js (Node runtime)
              ├─ (site) pages ──────────► catalog queries ─┐
              ├─ server actions ─► enquiries/submit ───────┼─► PostgreSQL
              ├─ admin pages/actions ─► authz ─► services ─┤      ▲
              ├─ /api/auth/* (Better Auth) ────────────────┘      │
              ├─ /api/admin/gmail/* (OAuth connect)               │
              └─ /api/cron/email-outbox ─► outbox worker ─────────┤
                                               │                  │
   after() / curl loop / npm run worker:email ─┘                  │
                                               ▼                  │
                                     Gmail API (gmail.send) ──────┘ (results recorded)
```

## Source layout

```
prisma/                schema.prisma, migrations/ (source of truth), seed.ts
scripts/               create-admin.ts, email-worker.ts, screenshot.mjs, test/ (stub + e2e prep)
src/
  domain/              Pure, framework-free business logic (unit tested)
    pricing.ts           pricing engine (bases, seasons, promo codes, quote-required reasons)
    schemas.ts           zod validation for public forms (shared by browser and server)
    admin-schemas.ts     zod validation for catalogue editing (rupees → paise)
    enquiry-status.ts    statuses and allowed transitions
    dates.ts money.ts slug.ts reference.ts trip-options.ts settings.ts
  server/              Server-only modules ("server-only" guarded)
    env.ts db.ts logger.ts auth.ts authz.ts audit.ts throttle.ts settings.ts request-context.ts
    catalog.ts           public read queries (PUBLISHED only)
    catalog-admin.ts     transactional package/destination saves, publish rules
    enquiries/submit.ts  validate → throttle → price → persist enquiry + outbox (one transaction)
    enquiries/admin.ts   status changes, notes, assignment, archive/delete, CSV
    email/               gmail.ts (OAuth + send), mime.ts (RFC 5322 builder), templates.ts,
                         outbox.ts (enqueue/claim/send/retry), config.ts, token-crypto.ts
    admin/action.ts      wrapper: authorise → validate → handle → audit-friendly errors
  app/
    (site)/            public pages + actions.ts (public server actions)
    admin/(auth)/      login, forgot/reset password
    admin/(panel)/     dashboard and management pages, each with actions.ts
    api/               auth, gmail connect/callback, cron
    sitemap.ts robots.ts not-found.tsx global-error.tsx
  components/          site/ (header, footer, cards, hero ring), forms/, admin/
  content/             images.ts (licensed image manifest), legal.tsx
  proxy.ts             convenience redirect for /admin (not an auth boundary)
tests/                 unit/, integration/, e2e/, support/
```

Rule of thumb: **domain** knows nothing about HTTP or the database; **server** owns I/O and authorisation; **app** and **components** handle presentation and call into server modules.

## Data model

```
User ─< Session, Account                    (staff only; Better Auth tables)
User ─< Enquiry (assignee), EnquiryNote, EnquiryStatusHistory, AuditLog

MediaAsset ─< DestinationImage >─ Destination ─< Attraction
MediaAsset ─< PackageImage     >─ Package
Destination ─< PackageDestination >─ Package ─< ItineraryDay, PackageFeature, PackageAddon, Offer
PricingRule: belongs to exactly one Destination OR Package (CHECK constraint)
PromoCode ─< Offer

Enquiry ─< EnquiryDestination (nameSnapshot)  ─< EnquiryNote  ─< EnquiryStatusHistory
Enquiry ─< EmailDelivery ─< EmailDeliveryAttempt
GmailCredential (single row "default"), SiteSetting (key → JSON), Testimonial, Faq,
RequestThrottle, RateLimit (auth), Verification (auth)
```

Key conventions:
- **UUID** primary keys everywhere (Better Auth is configured to generate UUIDs).
- **Money:** `Int` paise. Every price has a `PricingBasis`. Currency is INR.
- **Dates:** travel dates are `@db.Date`. "Today" is computed in Asia/Kolkata. Timestamps are UTC and shown in IST with the zone label.
- **History:** `Enquiry.snapshot` (JSON) holds the original submission, the estimate and the package/add-on details at submission time. Catalogue edits never change past enquiries.
- **Indexes** on enquiry status/type/created/email/follow-up, outbox `(status, nextAttemptAt)`, and catalogue `(status, sortOrder)`.
- **Deletion:** catalogue records are archived, not deleted (destinations used by packages are `Restrict`). Enquiries are archived, or deleted by admins only (cascades to notes, history and emails; audited by reference).

## Key flows

### Enquiry submission
```
form → server action (public) → hashIp → throttle(IP) → zod validate → throttle(email)
     → load rates/promo from DB → pricing engine (server)
     → TRANSACTION { enquiry (+destinations, +status history), outbox rows (internal + ack) }
     → return reference ──► UI success panel
     → after(): processOutbox()   (failures here never change the response)
```
Spam-flagged submissions (honeypot or too fast) are saved with status SPAM and no emails. A repeated `submissionKey` returns the existing reference.

### Outbox processing
```
1. stale SENDING rows (lease expired) → FAILED/UNKNOWN_OUTCOME (no auto-resend)
2. resolve transport (DB credential > env token); unconfigured/revoked → stop, nothing claimed
3. claim due PENDING rows: UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) → SENDING + lease
4. per row: expired → CANCELLED; resolve business inbox; send
      success → SENT (fenced on lease)  |  retryable → PENDING + backoff (or FAILED at max)
      permanent → FAILED (+ alert email to the business if a customer acknowledgement failed)
      auth revoked / config → mark credential, release all claimed rows (no attempt counted), stop
5. every attempt logged in email_delivery_attempt
```

### Authorisation
`proxy.ts` redirects requests without a session cookie away from `/admin/*`, but only as a convenience. The real checks are `requireStaffPage()` in every admin page and the `adminAction(minRole, schema, handler)` wrapper on every admin server action. Both re-read the user from the database (active + role). Route handlers call `requireStaff()`. Two roles: **STAFF** (enquiries and content) and **ADMIN** (plus staff management, business details, email connection, CSV export, enquiry deletion, audit log).

## Rendering and caching
Cache Components is off (TD-04). Public and admin routes render per request. `revalidatePath("/", "layout")` after content changes clears the client router cache. Images are optimised by `next/image` (AVIF/WebP). Fonts are self-hosted via `next/font`.

## Configuration
`src/server/env.ts` validates environment variables with zod on first use and at start-up (`src/instrumentation.ts`), naming missing or invalid variables without printing their values. See `.env.example`.
