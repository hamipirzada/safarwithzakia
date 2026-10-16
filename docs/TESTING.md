# Testing

| Suite | Command | What it uses |
|---|---|---|
| Type check | `npm run typecheck` | TypeScript strict |
| Lint | `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| Unit | `npm test` | Vitest; pure domain logic, MIME, templates, CSV, backoff |
| Integration | `npm run test:integration` | Vitest against a **real PostgreSQL** database `safar_test` (migrated automatically, truncated between tests) |
| End-to-end | `npm run test:e2e` (builds into `.next-e2e`, so running servers are untouched; `npm run test:e2e:only` skips the build) | Playwright (Chromium desktop + Pixel 7) against the **production build** on port 3100, database `safar_e2e`, and a local Google API stand-in on port 3199 |
| Everything | `npm run test:all` | All of the above |

## Release audit
See [RELEASE_READINESS.md](RELEASE_READINESS.md) for the consistency matrix, defects found and fixed, and the latest results.

## Prerequisites
- PostgreSQL reachable with the test databases created once:
  ```bash
  createdb safar_test && createdb safar_e2e       # or: docker exec <pg> psql -U safar -c "CREATE DATABASE safar_test" -c "CREATE DATABASE safar_e2e"
  ```
  Default URLs point at `postgresql://safar:safar_dev_pw@127.0.0.1:55433/…`. Override them with `TEST_DATABASE_URL` and `E2E_DATABASE_URL`.
- Playwright browser: `npx playwright install chromium`.
- Safety: integration helpers refuse to truncate unless the database name contains "test"; e2e preparation refuses unless the name ends in `_e2e`. Neither uses `prisma migrate reset`; both apply migrations with `migrate deploy`.

## Coverage map

**Unit (101 tests):** chart maths and server-rendered charts (scales, stacking, label spacing, comparisons, shares, links, empty states); dashboard period buckets and the dashboard failure state; pricing engine (rule selection, seasons crossing boundaries, validity windows, ambiguity, per person/group/day/package bases, child rates, promo codes, quote-required paths), dates (IST "today", leap years), money parsing/formatting, slugs, references, status transitions, form validation (dates, traveller counts, legs, header-injection attempts), admin catalogue validation, MIME building and header-injection rejection, email escaping and content, outbox backoff, CSV formula neutralisation.

**Integration (66 tests):** previous-period alignment, IST weekday counts and chart click-through filters in `dashboard.test.ts`; includes `dashboard.test.ts` (IST day boundaries, spam/archived rules, KPI/status/package/destination/email counts reconciled against fixtures, 12-month buckets, empty database), `release.test.ts` (publication rules, unchecked checkboxes, staff escalation, last-admin protection, staff creation/password reset) and `gmail-oauth.test.ts` (connect/callback, state validation, encrypted storage); enquiry persistence with history and outbox rows in one transaction; spam handling; duplicate-submission keys; IP and email throttles; server-side re-pricing ignoring client prices; inactive rates → quote; promo codes from the DB; package snapshots unchanged by later price edits; outbox idempotency, sending, never re-sending, unconfigured, retries with backoff, permanent failures, failure alerts, staff retry, revoked consent, interrupted sends, concurrent workers; Gmail client (token caching, `invalid_grant`, `invalid_client`, 5xx) and full delivery through the stub; package/destination transactions, rollback, publish rules, slug uniqueness, DB constraints; status transitions with history and audit; Better Auth sign-in, roles, no sign-up, hashed passwords, deactivation.

**End-to-end (64 tests),** including `dashboard-charts.spec.ts` (every chart vs SQL: tooltips by pointer/keyboard/touch, comparison, by-type legend toggles, click-through, table views, phone width, reduced motion), including `hero.spec.ts` (image resolution vs drawn size at 1×/2×, priority, no duplicates, slow 4G, failure fallbacks, step rotation, drag, reduced motion), `testimonials.spec.ts` (1–6 and 8 reviews at desktop/tablet/phone widths; carousel auto-advance, pause, controls, looping, reduced motion), `admin-ui.spec.ts` (sidebar icons/collapse/persistence/tooltips, staff permissions, mobile drawer, dashboard figures reconciled against SQL), and the admin-to-public lifecycle suite `lifecycle.spec.ts` (A destinations, B packages, C offers/promo codes, C2 fixed-amount promo codes edited live and stored on submitted trip and package enquiries, D testimonials/consent, E FAQs/content/business details, F images, G enquiries/email, H permissions/sessions, I own password change), each verified through the admin UI, a separate visitor context and the database. Also: the 14 required journeys: homepage (incl. keyboard-driven 3D ring), destination, package, complete custom trip with estimate (verified in the DB, including notification jobs), "Request a quote" path, contact form, invalid input, spam, status lookup, admin login, viewing and updating an enquiry, failed notification + staff retry (delivered to the stub), package edit visible on the site, unauthorised access (redirects, forged cookie → 401, cron 401, no sign-up), staff blocked from admin pages, worker endpoint, mobile menu, no horizontal overflow, contact and trip builder on a phone, 404 and legacy redirects, robots/sitemap.

## What the automated tests do NOT prove
Gmail calls in automated tests go to `scripts/test/google-stub.mjs`, a local imitation of Google's endpoints. **A passing suite does not prove that Google accepts or delivers mail.** Use the procedure below with a real, explicitly authorised test mailbox.

## Real Gmail integration test (manual, authorised mailbox)
1. Create a Google Cloud OAuth client as in DEPLOYMENT.md §4, with redirect `http://localhost:3000/api/admin/gmail/callback`, and add a **test mailbox you own** as a test user.
2. In `.env`: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`, and `ENQUIRY_RECIPIENT_EMAIL=<a second inbox you own>`. Restart `npm run dev`.
3. Admin → Email delivery → Connect Gmail → sign in as the test mailbox → allow.
4. Click **Send a test email**. Expected: "Gmail accepted the test email…", and the message arrives in the recipient inbox, sent from the test mailbox.
5. Submit `/contact` with a third address you own. Expected within seconds: the notification in the recipient inbox (Reply-To = your address) and the acknowledgement with the reference at your address. Admin shows both emails as **Sent** with Gmail message ids.
6. Revoke access at https://myaccount.google.com/permissions, submit another enquiry → Email delivery shows **Reconnect needed** and the emails stay queued. Reconnect → they send.
7. Record the date, mailbox and results in IMPLEMENTATION_STATUS.md.

## Performance (measured 16 Oct 2026)
Lighthouse 12, default mobile emulation (simulated slow 4G, 4× CPU slowdown), local production build (`next start`):

| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| `/` | 86 | 100 | 100 | 100 | 4.1 s | 70 ms | 0 |
| `/trip-builder` | 92 | 100 | 100 | 100 | 2.9 s | 210 ms | 0 |
| `/packages/kashmir-honeymoon-delight` | 93 | 100 | 100 | 100 | 3.2 s | 100 ms | 0 |
| `/destinations/gulmarg` | 95 | 100 | 100 | 100 | 2.9 s | 70 ms | 0 |

Earlier runs found and led to fixes for: unnamed step buttons on mobile (accessibility) and a CSP report caused by Zod's JIT feature probe (now `jitless`). Home performance varied between 86 and 94 across runs. Its LCP element is the full-width hero photograph; the next optimisations would be a smaller or more compressed hero source, or a lower `quality` for that decorative, low-opacity image.

Targets: Performance ≥ 90 on every page, CLS < 0.1, LCP < 2.5 s at the 75th percentile on real devices. Lab scores vary from run to run and depend on the host and CDN, so re-measure on the deployed site and track field data (Search Console / CrUX) after launch.
