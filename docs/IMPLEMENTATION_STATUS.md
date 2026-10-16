# Implementation status

Status values: **Tested** (implemented, and a corresponding automated test passed on 16 Oct 2026), **Implemented** (built and manually checked, no dedicated automated test), **Blocked** (needs an external input), **Not started**.

Last full run (16 Oct 2026, after round 2: hero, testimonials, admin dashboard): type check ✔ · lint ✔ (0 problems) · unit 101/101 ✔ · integration 66/66 ✔ · production build ✔ · e2e 64/64 ✔ (desktop + mobile, incl. 9 admin-to-public lifecycle tests and the round-2 hero/testimonial/admin-UI tests). See [RELEASE_READINESS.md](RELEASE_READINESS.md) for the per-module matrix and the 14 defects fixed.

## Research and documentation
| Item | Status |
|---|---|
| Reference site research, page inventory, journeys, assumptions, decisions | Implemented (docs/) |
| Architecture, deployment, operations, security, testing docs, README, .env.example | Implemented |

## Public website
| Feature | Status | Evidence |
|---|---|---|
| Responsive header, mobile menu, footer, WhatsApp button | Tested | e2e mobile "navigation menu…", "pages do not scroll sideways" |
| Homepage: hero, CTAs, real destinations, packages, FAQs, contact strip | Tested | e2e public "homepage shows…" |
| Interactive 3D destination ring (drag/swipe/keys, reduced motion) | Tested (keyboard) / Implemented (drag, touch, reduced motion: manual) | e2e public "3D ring…" |
| Offers section (only when published offers exist) | Implemented | manual (admin offers page) |
| Testimonials section (only verified + consented) | Tested | e2e "…must not appear"; integration DB constraint |
| Destinations list and detail (rates with basis, gallery, related packages) | Tested | e2e public "opens a destination" |
| Packages list and detail (route, itinerary, inclusions, pricing basis, enquiry form) | Tested | e2e public "views a package"; integration package enquiry |
| Package enquiry submission | Tested | integration "package enquiries" |
| Custom trip builder (5 steps, add/remove/reorder, validation, review, persistence, duplicate protection) | Tested | e2e "completes a custom trip…"; integration |
| Server-side pricing engine and "Request a quote" fallback | Tested | unit pricing; e2e quote path |
| Contact form | Tested | e2e contact, invalid input, mobile |
| Spam handling (honeypot, time-trap, rate limits) | Tested | e2e spam; integration throttles |
| Enquiry status lookup (reference + email) | Tested | e2e "checks an enquiry's status…" |
| About page (editable content) | Implemented | manual |
| Privacy / terms / booking conditions ("awaiting review" notice) | Implemented | manual; legal review **Blocked** (business) |
| Photo credits, 404, error pages, legacy `.php` redirects | Tested (404, redirects) / Implemented (credits, error boundary) | e2e public |
| SEO: metadata, canonical, OG, JSON-LD, sitemap, robots | Tested (sitemap/robots) / Implemented (metadata) | e2e "SEO files…"; Lighthouse SEO 100 |
| Accessibility basics (labels, focus, alerts, reduced motion) | Implemented | Lighthouse accessibility 100 on 4 pages |

## Email (Gmail)
| Feature | Status | Evidence |
|---|---|---|
| Durable outbox written with the enquiry | Tested | integration enquiries/outbox |
| Gmail API client (token refresh, send, error classification) | Tested against a local stub | integration gmail |
| OAuth connect flow (state cookie, encrypted token storage) | Implemented | code exchange tested against the stub; full browser consent flow needs real Google credentials |
| Templates (internal, acknowledgement, password reset, failure alert, test) with escaping | Tested | unit email |
| Retries with backoff, max attempts, permanent failures, failure alerts | Tested | integration outbox |
| Idempotency / no duplicate sends / interrupted-send handling / concurrent workers | Tested | integration outbox |
| Revoked consent handling and recovery | Tested | integration outbox + gmail |
| Admin failure visibility and manual retry | Tested | e2e "failed notification… retried by staff" |
| Worker: `after()`, cron endpoint, CLI worker, Docker curl loop | Tested (cron endpoint) / Implemented (CLI worker, Compose loop) | e2e worker endpoint |
| **Real delivery through Google with the business mailbox** | **Blocked** | needs OAuth client + mailbox authorisation (TESTING.md procedure) |

## Admin
| Feature | Status | Evidence |
|---|---|---|
| Login, logout, throttling, no public sign-up, deactivation | Tested | integration auth; e2e |
| Forgot / reset password (via outbox) | Implemented | manual flow; email needs Gmail |
| Role-based authorisation on pages, actions and APIs | Tested | integration auth; e2e unauthorised + staff-blocked |
| Dashboard with real metrics | Implemented | manual screenshot |
| Enquiry list: search, filters, pagination | Tested (search) / Implemented (filters) | e2e admin flow |
| Enquiry detail: snapshot, status transitions + history, notes | Tested | e2e; integration status changes |
| Assignment, follow-up dates, archive | Implemented | manual |
| Permanent delete (admin, audited) | Implemented | manual |
| CSV export (admin, audited, formula-safe) | Tested (auth + escaping) / Implemented (download) | e2e forged-cookie 401; unit csvCell |
| Package editor (create/edit/publish/unpublish/archive, transactions) | Tested | integration catalog-admin; e2e edit |
| Destination editor with rates | Tested | integration catalog-admin |
| Offers and promo codes | Tested (promo pricing) / Implemented (admin UI) | integration promo |
| Testimonials (consent-gated), FAQs, site content, business details | Implemented | manual; DB constraint tested |
| Email delivery page (status, connect, recipient, test send, queue) | Implemented | manual screenshot; actions use tested services |
| Staff management, audit log | Implemented | manual |

## Platform
| Item | Status |
|---|---|
| PostgreSQL schema, migrations, CHECK constraints | Tested (integration runs on migrated DB; constraint tests) |
| Environment validation at start-up | Implemented |
| Security headers / CSP (no violations on main pages) | Implemented (verified by browser probe and Lighthouse) |
| Dockerfile + docker-compose (db, migrate, app, worker) | Implemented (image built and smoke-tested; full Compose stack not run) |
| Vercel cron config | Implemented (not deployed) |
| Performance measured with Lighthouse | Done (TESTING.md) |

## Blocked on the business / external input
1. Gmail OAuth client credentials and authorisation of the business mailbox; business inbox address.
2. Destination rate basis and inclusions, so rates can be activated (ASSUMPTIONS A-02).
3. Honeymoon package inclusions and validity (A-03).
4. Testimonial verification (A-06); brand spelling (A-01); legal review and retention period (A-10, A-11).
5. Production domain, hosting choice and database.
