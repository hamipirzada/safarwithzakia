# Release readiness — Safar With Zakia

**Review date:** 16 October 2026 · **Scope:** final QA, admin CMS consistency, release readiness · **Code state:** uncommitted working tree on top of `a2b5a2e` (nothing committed, pushed or deployed).

## A. Executive summary

**Status: READY FOR A STAGING DEPLOYMENT — BLOCKED FOR PUBLIC LAUNCH on external inputs, not on code.**

The audit found and fixed **14 defects** (one reported during your follow-up testing), including two critical ones:
- creating any new destination or package crashed;
- every admin form with an unchecked checkbox was rejected, which broke saving testimonials without consent, deactivating promo codes, turning off customer acknowledgements and hiding the announcement banner.

Both were missed by the previous test suite, which only edited existing records.

After the fixes, every admin module was exercised through the real admin UI, with an independent visitor browser context and direct database checks confirming each change:
- 9 admin-to-public lifecycle tests (A–I);
- 59 integration tests against PostgreSQL;
- 69 unit tests;
- 36 end-to-end tests in total, on desktop and phone;
- a production build.

All pass. Admin changes persist, appear on the public site on the next request without a hard refresh, respect publication rules, preserve historical enquiries, and fail without corrupting data.

Public launch still needs:
1. Gmail OAuth credentials, plus a **real delivery test** to an authorised mailbox. Delivery is proven only against a local stand-in.
2. Confirmation of the destination rate basis (rates stay switched off until then; this is a business decision, not a defect).
3. Production infrastructure and secrets.
4. Legal review of the policy pages.

## B. Admin-to-public consistency matrix

Legend: **PASS** means an automated test exercises it and passed in the final run. **N/A** means not applicable by design (reason given). **BLOCKED** means it needs external credentials. Evidence refers to tests listed in §D (`L-x` = `tests/e2e/lifecycle.spec.ts` test x; `INT` = integration; `E2E` = other Playwright specs).

| Module | Create | Read | Update | Publish / unpublish | Archive / delete | DB persisted | Public rendering | Fresh without reload | Authorisation | Regression | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Destinations | PASS | PASS | PASS | PASS | PASS (archive; delete N/A: archive-only so packages/enquiries keep references) | PASS | PASS (list, detail, home ring, trip builder, sitemap) | PASS | PASS | PASS | L-A, INT catalog-admin, release |
| Destination images (hero/gallery) | PASS (select from licensed library) | PASS | PASS (replacement shown on list + detail) | — | Missing image → designed placeholder: PASS | PASS | PASS | PASS | PASS | PASS | L-A, L-F, INT release (unknown image id rejected) |
| Destination attractions | PASS | PASS | PASS (DB) | — | PASS (removal replaces set) | PASS | PASS (seeded attractions rendered) | PASS | PASS | PASS | INT catalog-admin, E2E public |
| Destination rates (incl. seasons) | PASS | PASS | PASS (price change → new estimate) | PASS (active flag) | PASS | PASS | PASS (price label, trip builder estimate) | PASS | PASS | PASS | L-A, unit pricing (seasons/validity), INT enquiries |
| Packages | PASS | PASS | PASS (title, description, slug field, price) | PASS (draft → live → unpublished, direct URL 404) | PASS (archive) | PASS | PASS (list, detail, home, destination "related", sitemap) | PASS | PASS | PASS | L-B, L-A, INT catalog-admin, release |
| Package itinerary | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | PASS | PASS | L-B |
| Inclusions / exclusions | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | PASS | PASS | L-B, E2E admin |
| Package images | PASS | PASS | PASS | — | PASS | PASS | PASS | PASS | PASS | PASS | L-B, INT catalog-admin |
| Package pricing rules | PASS | PASS | PASS (₹20,000 → ₹22,000 shown and used in new enquiries) | PASS (active flag) | PASS | PASS | PASS | PASS | PASS | PASS | L-B, unit pricing |
| Package add-ons | PASS | PASS | PASS (DB) | PASS (offered flag) | PASS | PASS | PASS (priced into enquiry estimate) | PASS | PASS | PASS | INT enquiries, catalog-admin |
| Offers | PASS | PASS | PASS | PASS (draft hides; past end date hides) | PASS (delete) | PASS | PASS (home section) | PASS | PASS | PASS | L-C, INT release |
| Promo codes | PASS | PASS | PASS (deactivation removes from offer + pricing) | PASS (active, validity window) | N/A (no delete; deactivate keeps historical references) | PASS | PASS (server discount, expired / not-yet / minimum / invalid / cap) | PASS | PASS | PASS | L-C, unit pricing, INT enquiries |
| Promo redemption limit ("over-limit") | N/A — no redemption counter by design (an enquiry is not a sale; TECHNICAL_DECISIONS TD-15). Max-discount cap tested instead. | | | | | | | | | | L-C |
| Testimonials + consent | PASS | PASS | PASS | PASS (publishing without consent refused by server + DB constraint) | PASS (delete) | PASS | PASS | PASS | PASS | PASS | L-D (incl. audit trail), INT catalog-admin, release |
| FAQs | PASS | PASS | PASS | PASS (draft/archive hide) | PASS | PASS | PASS | PASS | PASS | PASS | L-E |
| Home content | — | PASS | PASS | — | PASS (reset to defaults) | PASS | PASS | PASS | PASS | PASS | L-E |
| About content (story, team…) | — | PASS | PASS | — | — | PASS | PASS | PASS | PASS | PASS | L-E |
| Announcement banner | — | PASS | PASS | PASS (enable/disable) | — | PASS | PASS | PASS | PASS | PASS | L-E |
| Business details | — | PASS | PASS (normalised WhatsApp shown after save) | — | Optional fields blank → layout intact: PASS | PASS | PASS (footer, contact page, links) | PASS | PASS (admin-only) | PASS | L-E, L-H |
| Email connection settings | PASS (OAuth connect) | PASS | PASS (recipient, acknowledgement toggle) | — | PASS (disconnect code path; revoked credential handling) | PASS | N/A (admin only) | PASS | PASS (admin-only, state cookie) | PASS | INT gmail-oauth, gmail, outbox |
| Enquiries | PASS (contact, package, custom trip, via public forms) | PASS (search, filters, detail) | PASS (status transitions) | N/A | PASS (archive/restore; permanent delete admin-only, audited) | PASS | N/A | PASS | PASS | PASS | L-G, L-B, E2E enquiries/admin |
| Enquiry notes | PASS | PASS | N/A (append-only) | — | Cascade with enquiry deletion: PASS | PASS | N/A | PASS | PASS (revoked session cannot add) | PASS | E2E admin, L-H |
| Assignment & follow-up | — | PASS | PASS (persists after reload, IST) | — | — | PASS | N/A | PASS | PASS | PASS | L-G |
| Status history | PASS (automatic) | PASS | N/A (immutable) | — | — | PASS | N/A | PASS | PASS (actor recorded) | PASS | INT catalog-admin, L-H |
| Email deliveries & retry | PASS (outbox) | PASS | PASS (retry/cancel) | — | — | PASS | N/A | PASS | PASS | PASS | E2E admin retry, L-G (no duplicates), INT outbox |
| Staff accounts & roles | PASS (UI, L-I) | PASS | PASS (role, deactivate, password reset; self-service change on My account) | — | Deactivate (no delete, so history keeps actors): PASS | PASS | N/A | PASS (deactivation ends sessions) | PASS (staff cannot escalate; last admin protected) | PASS | INT release, auth; L-H |
| Audit log | PASS (automatic) | PASS | N/A (append-only) | — | — | PASS | N/A | PASS | PASS (admin-only page) | PASS | L-D, L-G, L-H, INT |
| Media uploads | N/A — no upload feature by design (serverless storage; TD-09). Images are chosen from the licensed library; invalid ids rejected; missing files degrade to a placeholder. | | | | | | | | | | L-F, INT release |

### How freshness works (verified, not assumed)
- **Server:** no data cache exists. Every public and admin route is `force-dynamic`, there is no `use cache`, `unstable_cache` or fetch caching, and Cache Components is off. Each request reads the database.
- **Client router:** Next 16's default `staleTimes.dynamic` is 0 s, so navigations refetch.
- **After mutations:** admin actions call `revalidatePath("/", "layout")` for catalogue and content changes and `router.refresh()`. Tag-based invalidation is unnecessary because nothing is tagged or cached.
- **Proof:** the lifecycle tests check a separate visitor context immediately after each save, by both direct navigation and clicking from listings, with no hard reload.

## C. Defects discovered and fixed

| # | Severity | Defect | Root cause | Fix | Proving test |
|---|---|---|---|---|---|
| D1 | **Critical** | `/admin/destinations/new` and `/admin/packages/new` crashed: no new destination or package could be created | `emptyDestination()`/`emptyPackage()` were exported from `"use client"` modules and called from server pages | Moved to `src/domain/admin-schemas.ts`; scanned all client modules for the same pattern (none left) | L-A, L-B create steps |
| D2 | **Critical** | Every admin form with an unchecked checkbox was rejected ("expected nonoptional"): testimonials without consent, deactivating promo codes, disabling acknowledgements or the banner | Browsers omit unchecked boxes; Zod 4 treats a missing key as an error unless the field is `.optional()` | `formCheckbox` is now `.optional()` | INT release "accepts unchecked checkboxes", unit actions, L-C, L-D, L-E |
| D3 | High | Admin form input was wiped when the server rejected it | React 19 resets uncontrolled inputs after a `<form action>` completes, even on error | `ActionForm` submits via `onSubmit` + `startTransition` (no auto-reset); double submits ignored while pending | Browser probe (before/after); L-D (consent rejection, then retry with same values) |
| D4 | High | Rejected admin forms said "check the highlighted fields" but highlighted nothing and gave no reason | Server field errors never reached `TextField`s | Field errors passed through context (inputs get `aria-invalid` + message); the summary also lists each problem | Browser probe; L-D |
| D5 | High | Success confirmations vanished immediately (and publish/unpublish confirmations were never reliably shown) | Forms remounted after save, and each status button had its own form that unmounted when the buttons changed | Only the inputs remount on a new saved version; the message persists and is hidden while a new save is pending; status controls are one form | L-A…L-E (`clickAndConfirm` waits for the server response and the message in that form) |
| D6 | High | A published package could be edited to route through an unpublished destination; that stop then silently vanished from the public page | `savePackage` only checked destinations when changing status, not when editing a live package | Saving a published package requires a route of published destinations | INT release "refuses to route a published package…" |
| D7 | Medium | After saving, editors showed what was typed, not what was stored (e.g. "22,000" instead of 22000; normalised WhatsApp) | Client state never resynchronised with the persisted record | Editors reset to the persisted record whenever its `updatedAt` changes | L-B ("shows the persisted, normalised amount"), L-E |
| D8 | Medium | The home page advertised promo codes that had expired or were not yet valid | Offer query checked only `active` | Codes shown only while active and within their validity window; offer dates formatted in IST | INT release offers test, L-C |
| D9 | Medium | Long content (e.g. "Plan a trip with ⟨long destination name⟩") scrolled sideways on phones by up to 441 px | Grids declared columns only at `lg` (implicit columns grew past the viewport); buttons were `nowrap` | `grid-cols-1` base on 52 grids; buttons wrap and centre their text | E2E mobile "very long names and descriptions…" |
| D10 | Medium | Staff signing in during a database outage were told "The email or password is incorrect" | All non-429 sign-in errors were mapped to the credentials message | 5xx → "Sign-in is temporarily unavailable" | Manual outage check (§D) |
| D11 | Medium | Admin actions threw an unhandled error (no admin error boundary) if the database failed during the session check | `adminAction` re-threw non-authorisation errors | Fails closed with "Nothing was saved"; added `admin/(panel)/error.tsx` | Unit actions "fail closed…" |
| D12 | Low | Several admin `<select>` labels were not associated with their controls (screen readers could not name them) | Missing `htmlFor`/`id` | Unique ids per record | L-C, L-D, L-E select by label |
| D14 | High | An administrator who used **Reset password on their own account** (Admin → Staff) was signed out before the new temporary password could be shown, locking them out (found in user testing after the audit) | The reset revokes all of the target's sessions, including the admin's own; the page refresh then redirects to sign-in, losing the one-time password | Self-reset refused on the server ("use My account"), and the button is replaced by "Change my password" on your own row. New **My account** page: current + new password via Better Auth `changePassword` with `revokeOtherSessions` (you stay signed in; other devices are signed out). Password changes are audited (`staff.password_changed`). | INT release "refuses to let an administrator reset their own password…"; L-I (create staff → change own password → stays signed in → old password rejected → audited) |
| D13 | Low | Rebuilding for tests replaced `.next` under a running `next start`, breaking it (this actually happened on port 3200 during review) | Shared build directory | E2E builds into `.next-e2e` via `NEXT_DIST_DIR` | `npm run test:e2e` |

Also improved: pricing rules reload in a stable order (they were saved with identical timestamps); stable `data-record-id` hooks on admin list rows; the floating WhatsApp button no longer covers the last footer links on phones.

**Test-only findings (not application defects):** ambiguous selectors, a wrong-direction time-zone conversion in a test's own SQL, and a stale-message race in an earlier helper (fixed with `clickAndConfirm`). The production login throttle (10 sign-ins per 15 minutes) blocked the suite when it signed in for every test. The throttle was **left in force**, and the tests now reuse the admin session.

## D. Actual test results (final run, 16 Oct 2026)

All commands run with Node 22.23.3 against the dedicated test databases `safar_test` / `safar_e2e`. The development database `safar` (which holds your own test enquiries) was never written to by any test.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 problems |
| `npm test` (unit) | **69 passed**, 0 failed, 0 skipped (5 files) |
| `npm run test:integration` | **59 passed**, 0 failed, 0 skipped (7 files: enquiries, outbox, gmail, gmail-oauth, catalog-admin, auth, release) |
| `npm run build` | PASS |
| `npm run test:e2e` (builds `.next-e2e`, then Playwright) | **36 passed**, 0 failed, 0 skipped, 0 flaky: desktop Chrome + Pixel 7 |
| — of which admin-to-public lifecycle (L-A…L-I) | 9 passed |
| `npm audit --omit=dev` | 0 vulnerabilities in production dependencies |
| `npm audit` (incl. dev) | 5 "high", all one advisory (`braces` via `eslint-config-next` → `fast-glob`), lint toolchain only, never shipped. The offered "fix" downgrades to Next 14 lint config, so it is **accepted risk**; revisit when `eslint-config-next` updates. |
| `docker build --target runner` (after all fixes) + container smoke test | PASS: image builds; `/`, `/destinations`, package detail, trip builder, robots return 200; `/admin/destinations/new` redirects to sign-in; no errors logged |
| Secret scan of files git would add | Clean: no tokens or keys; only `.env.example`; the dev admin password appears nowhere in the repository |

Expected log lines during e2e: two `email.send_failed` warnings (the retry test deliberately makes the Gmail stub fail) and one image 404 (test F points at a deliberately missing file).

**Manual verifications** (production build, isolated ports):
- Invalid configuration (`AUTH_SECRET` too short): the server refuses to start, naming the variable, without printing values.
- Database unreachable: public pages return 500 with a "Something went wrong — Try again" page. The admin login now says "temporarily unavailable" (D10). Logs contain no secrets.
- Empty, freshly migrated database (`safar_empty_check`, created for this check): all public pages return 200 with their empty states, unknown detail URLs return 404, and no errors are logged.
- Visual check (desktop + phone): home, package detail and trip builder after the layout fixes.

Not re-run in this review: Lighthouse (last measured earlier on 16 Oct: accessibility, best practices and SEO 100; performance 86–95).

## E. Gmail status

| Layer | Status | Evidence |
|---|---|---|
| Outbox logic (persist-first, retries, backoff, no duplicates, interrupted sends, concurrent workers, revoked consent) | **PASS (mocked transport)** | INT outbox (11 tests) |
| Gmail REST client (token refresh/caching, `invalid_grant`, `invalid_client`, 5xx/timeouts classified) | **PASS against a local Google stand-in** | INT gmail |
| OAuth connect + callback (random state, single-use state cookie, mismatch rejected, consent-denied handled, admin-only, token stored AES-GCM encrypted, audited) | **PASS against a local Google stand-in** | INT gmail-oauth (5 tests) |
| End-to-end through the app (submit → stub receives notification + acknowledgement once; failure → visible → staff retry → SENT with provider id) | **PASS against a local Google stand-in** | E2E admin retry, L-G |
| Real OAuth consent with Google | **BLOCKED**: no Google Cloud OAuth client exists | — |
| **Confirmed real email delivery** | **BLOCKED**: not performed; nothing here proves Google delivers mail | Procedure: docs/TESTING.md "Real Gmail integration test" |

## F. Outstanding business decisions (genuine)

1. **Basis of the destination daily rates** (₹3,500 / 4,500 / 4,000 / 6,000): per person, per couple, per group or per vehicle, and what they include. Until confirmed they stay inactive and visitors see "Request a quote" (ASSUMPTIONS A-02).
2. **Honeymoon package** (₹18,500 for 2): inclusions, validity and season (A-03).
3. **Brand spelling:** "Zakia" vs "Zakiya" (A-01).
4. **Old-site testimonials:** genuine and consented? (A-06). They remain drafts.
5. **"Best price guarantee" / "24/7 local support"** claims (A-07).
6. **Legal review and retention period** for policy pages and enquiry data (A-10, A-11).
7. **Which mailbox sends and which receives** enquiry email (A-15).

## G. Deployment blockers

| Item | Needed |
|---|---|
| Environment | `DATABASE_URL`, `APP_URL` (https production origin), `AUTH_SECRET` (`openssl rand -base64 48`), `EMAIL_WORKER_SECRET` (`openssl rand -hex 32`), `ENQUIRY_RECIPIENT_EMAIL`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` (= `https://<domain>/api/admin/gmail/callback`). Vercel only: `CRON_SECRET` = `EMAIL_WORKER_SECRET`. Behind a proxy that overwrites `X-Forwarded-For`, or set `TRUST_PROXY_HEADERS=false`. |
| Google Cloud | Project with the Gmail API enabled; OAuth consent screen (Internal for Workspace, or External set to **In production**, not Testing, because Testing tokens expire after 7 days); Web OAuth client with the redirect URI above; business mailbox authorised via Admin → Email delivery → Connect Gmail; then a real test email (procedure in TESTING.md). |
| Database | Production PostgreSQL 14+ with a dedicated owner role, TLS, automated backups. Run `npm run db:deploy` (applies 2 migrations: `init`, `enquiry_submission_key`), then `npm run db:seed` once, then `npm run admin:create -- --email … --name …`. |
| Infrastructure | Hosting (Docker Compose on a VPS with Caddy/nginx TLS, or Vercel + managed Postgres), domain DNS, HTTPS, log collection, uptime monitoring, an outbox scheduler (Compose `email-worker`, Vercel Cron or an external cron). |
| Content | Activate destination rates once their basis is confirmed; verify or replace testimonials; review legal pages (set `reviewed: true` in `src/content/legal.tsx` after review). |

**Data safety and rollback plan:**
- **Backup before release:** take a `pg_dump -Fc` of production before running migrations, and keep 30 days of nightly backups off-server, encrypted (OPERATIONS.md).
- **Rollback:**
  - App: redeploy the previous image or commit.
  - Database: migrations are additive, so the previous version keeps working. If a migration must be undone, restore the pre-release dump into a fresh database, rehearsed on staging first.
- **Staging:** separate database, secrets and mailbox; never the production inbox.
- **Development credentials:**
  - The local admin `admin@example.test` exists only in the local `safar` database.
  - The e2e accounts exist only in `safar_e2e`.
  - None of these can reach production, because production data is seeded fresh and admins are created with `admin:create`.
  - Do not copy local databases to production.

**Git working tree** (not committed, per instruction): 180 untracked plus modified files. Generated code (`src/generated`), builds (`.next`, `.next-e2e`), test artifacts and `.env` are ignored. Lockfile and both migrations are included. The local Docker database password `safar_dev_pw` appears in README/test configs by design: it is a throwaway local container bound to 127.0.0.1.

Leftover local state from this review, safe to remove on your instruction:
- the `safar_empty_check` database (empty);
- the Docker images `safar-with-zakia:local` / `:qa`;
- the `safar_test` / `safar_e2e` databases (test data only).

## H. Release recommendation

**GO for staging. NO-GO for public launch until the Gmail credentials exist and a real delivery test passes**, and the rate-basis decision is either made or consciously launched with "Request a quote" everywhere.

Reasons:
- The core promise, that admin changes persist and reach the public site correctly, is now demonstrated end to end for every module, with database and visitor-side verification. The two critical admin defects that previously made content management partly unusable are fixed and covered by regression tests.
- What remains is external configuration and a real-mail check that cannot honestly be faked: enquiries are safely stored either way, but the business would not be notified.
- With credentials in place, the remaining work is a staging deploy, the TESTING.md real-mail procedure, the smoke test in DEPLOYMENT.md §6, and then production.

---

# Round 2 — hero images, testimonial layout, admin dashboard (16 Oct 2026)

**Outcome:** all three issues reproduced, root-caused, fixed and covered by regression tests. Full suite green (type check, lint, 74 unit, 62 integration, production build, 54 end-to-end). **Staging: ready.** Public launch is still blocked only on the external items in §G (Gmail credentials and a real delivery test, rate-basis decision, infrastructure, legal review).

## R2-1. 3D hero images blurry (sometimes for minutes)

**Reproduced** on the production build with network and DOM inspection (`currentSrc`, natural vs drawn size, request log) and a Laplacian-variance sharpness measurement of the front card.

**Root causes (three, compounding):**
1. **Wrong `sizes` for a cropped image (main cause).** Ring cards are portrait (3:4, ~232×309 px on desktop) but every photo is landscape (up to ~1.8:1) and drawn with `object-cover`, so the drawn image is ~464 px wide. `sizes` declared the *card* width (`15rem` = 240 px), so the browser chose a ~256 px image at 1× density (upscaled ~1.8×) and 640 px at 2× (needed ~929 px, upscaled ~1.45×). Blurry from the first frame, at every DPR.
2. **Continuous rotation.** The auto-rotation rewrote the 3D transform every animation frame, so the front card was almost never front-facing: the photo was always resampled through a perspective transform. GPU browsers also rasterise constantly animating 3D layers at reduced resolution and only re-rasterise sharp when motion stops. With auto-rotate running whenever the pointer was elsewhere, the ring could look soft until someone hovered it or switched tabs, which matches "sharp eventually, sometimes after minutes". The perspective resampling is visible in code and screenshots. The GPU raster-scale effect could not be reproduced in headless (software-composited) Chromium, so it is recorded as a likely contributor, not a proven one.
3. **No loading priority.** All ring images used default lazy loading with no priority, although the front card is above the fold (and, as Lighthouse later confirmed, the page's LCP element).

No CSS blur filter, placeholder, WebGL texture or failing request was involved (all verified).

**Fix** (`src/components/site/HeroRing.tsx`, `src/components/site/Photo.tsx`):
- `sizes` now describes the drawn width: `(min-width: 1024px) 560px, (min-width: 640px) 500px, 430px`. The source photos are 2000 px licensed originals, so no upscaling is needed.
- The front card is `loading="eager"` + `fetchPriority="high"`, its two neighbours are eager, and the rest are lazy (low priority), loaded progressively. The page hero photo uses Next 16's `preload` (`priority` is deprecated in v16).
- Auto-rotation now **steps one card every 4.5 s** with a 600 ms compositor transition and rests exactly front-facing (identity transform). It still pauses on hover/focus/interaction/off-screen and is disabled for reduced motion. Drag, touch, keyboard and buttons are unchanged.
- Explicit `data-image-state` loading → loaded / error. On error, a toned fallback card keeps the destination name (accessible name preserved) and nothing can stay "loading" after a failure. The image is **never hidden or blurred** while loading. An intermediate version faded images in after hydration; Lighthouse showed this delayed LCP by ~3.7 s of render delay on mobile, so it was removed before release.

**Measured** (production build):

| | Before | After |
|---|---|---|
| Front card sharpness (Laplacian variance), 1× DPR | 215.8 | 257.0 (+19%) |
| Front card sharpness, 2× DPR | 114.9 | 168.5 (+47%) |
| Image downloaded vs needed, 2× DPR | 640 px for ~929 px | 1440 px for ~929 px |
| Slow-4G mobile, cold cache: front image loaded | — | 3.5 s; all 8 ring images by 10 s |
| Duplicate image downloads | — | 0 |
| All ring requests failing | — | 7 fallbacks, 0 broken/stuck images |
| Lighthouse home (mobile, 3 runs) | perf 86, LCP 4.1 s | perf 86–88, LCP 3.9–4.2 s; A11y/BP/SEO 100; CLS 0 |

**Tests:** `tests/e2e/hero.spec.ts` (7 tests) covers:
- downloaded width ≥ drawn width × DPR at 1× and 2×, eager + high priority, no filter, opacity 1;
- every ring image loaded, none downloaded twice;
- slow-4G cold load < 15 s;
- aborted image requests become fallbacks with accessible names, nothing stuck;
- step-wise rotation resting at an exact card angle;
- mouse drag;
- reduced motion (no auto-advance, buttons still work).

The keyboard ring test and the "no console errors" test in `public.spec.ts` still pass.

## R2-2. Testimonials stacking in pairs

**Root cause:** the section was a fixed two-column grid (`md:grid-cols-2`) at every width from tablet up, which renders 2-then-2 rows regardless of how many reviews exist. **Additional defect found:** it rendered only `testimonials.slice(0, 4)`, so a fifth or later published testimonial **never appeared** on the site. There was no duplicate rendering (one record → one card).

**Fix:** new `src/components/site/Testimonials.tsx`, one deliberate editorial layout:
- **One** review: a featured quote.
- **Two:** two columns.
- **Three or more:** 1 column on phones, 2 on tablets, 3 on desktop.
- **Cards:** consistent padding, equal-height rows with attribution aligned at the bottom, no truncation, optional rating with a text label.
- **Beyond six:** the remaining reviews sit behind an accessible "Read N more traveller stories" disclosure, so every published review stays reachable.

Data still comes from the database and the consent/publication rules are unchanged (database constraint plus query).

**Tests:** `tests/e2e/testimonials.spec.ts` publishes 1, 2, 3, 4, 5, 6 and 8 isolated fixtures (plus a draft and an archived one) and checks, at desktop 1280, tablet 834 and phone 390 widths:
- the exact card count with no duplicates;
- drafts and archived reviews excluded;
- the columns actually used (featured / 2 / 3 / 2 / 1);
- no horizontal overflow;
- the disclosure revealing the remaining reviews.

Admin add → publish (consent enforced) → edit → unpublish is covered by lifecycle test **L-D**.

## R2-3. Admin dashboard redesign

**Visual system** (reused existing tokens; no UI library added):
- refined page headers, cards with descriptions, tables with header band and row hover, pill badges with a status dot (the label is always present, never colour alone), stat tiles;
- designed empty states and error states;
- `aria-hidden` toast notifications (`Toaster.tsx`) as a brief visual cue. The announced, authoritative message stays inline beside the form, which preserves the round-1 guarantees (input kept on error, persisted values shown after save, no false success).
- The admin has no dark theme (neither does the existing app), so dark mode is not applicable.

**Sidebar** (`AdminShell.tsx`):
- **Expanded:** a Lucide icon (already installed) and label for every item, with an active-route bar.
- **Collapsed:** a 72 px icon rail. Labels stay as screen-reader text, and tooltips appear on hover **and** keyboard focus. These are rendered `fixed` because the scrolling nav list was clipping them, a defect found during the visual check.
- **Toggle:** "Collapse/Expand sidebar" (`aria-pressed`). The preference is stored in a cookie read by the server layout (`src/lib/admin-preferences.ts`), so the first render has the right width (no flash, no hydration mismatch) and it persists across navigation and reloads.
- **Mobile:** a drawer dialog (`aria-modal`) with backdrop, focus moved in, Tab trapped, Escape/backdrop/link closes it, and focus returns to the menu button.
- **Permissions:** items are shown per role exactly as authorised, and authorisation is still enforced on the server.
- **Dev only:** Next's development badge sat on top of the rail's bottom-left controls (and, if moved, the mobile menu button), so `devIndicators` is now off. Production is unaffected.

**Dashboard** (`src/server/dashboard.ts`, `src/components/admin/charts.tsx`, `admin/(panel)/page.tsx`). The form of each element was chosen by its job, following the project data-viz method:
- **Period filter** (7 days / 30 days / 90 days / 12 months), one row above everything it scopes.
- **KPI stat tiles:** enquiries received (period), open now, follow-ups due now, published packages, published destinations.
- **Enquiry trend:** single-series line + 10% area, India-time daily or monthly buckets, zero-filled. It has a crosshair tooltip with a per-type breakdown, arrow/Home/End keyboard reading with a live region, a labelled endpoint, and a "Show table" alternative.
- **Status breakdown:** horizontal bars rather than a donut (seven categories), each linking to the filtered enquiry list.
- **Most requested packages and destinations:** horizontal bars.
- **Email delivery:** sent in period, queued now, failed now. Status icon plus label, never colour alone.
- **Follow-up queue** (overdue flagged) and **recent enquiries** table.
- **Chart colour:** the brand teal failed the palette validator's chroma floor and saffron failed 3:1 contrast, so charts use the documented, validated slot-1 blue `#2a78d6`. Brand colours remain in the chrome.
- **Data integrity:** no revenue, conversion or booking figures, because the database has none.

**Real data / performance:**
- All aggregation runs in PostgreSQL (`GROUP BY`, `date_trunc` in IST, bounded `take`), with no enquiry list loaded into memory. One `Promise.all` batch fetches everything.
- Definitions are shown on each card. For example, volume excludes spam, the status breakdown includes it, and "open" means right now.
- On a database failure the page shows an explicit "unavailable" alert, never zeros. Navigation badges degrade silently instead of breaking the shell.

**Tests:**
- `tests/integration/dashboard.test.ts`: deterministic fixtures prove the IST day boundaries (23:30 and 00:30 IST land in the right days), spam excluded from volume, archived included, status, KPI, package/destination and email counts, the follow-up queue, the 12-month buckets, and honest zeros on an empty database.
- `tests/unit/dashboard.test.ts`: period buckets.
- `tests/unit/dashboard-page.test.ts`: renders the real page with the data layer failing and asserts the alert with no figures.
- `tests/e2e/admin-ui.spec.ts`:
  - every nav item's icon and route;
  - collapse reflowing the content;
  - tooltips on hover and focus;
  - persistence across navigation and reload;
  - staff seeing exactly their permitted items, with the server still blocking the rest;
  - the mobile drawer's open, focus trap, Escape, backdrop and focus return, and link navigation;
  - KPI, trend-table total and status-bar values equal to independent SQL over the same period, keyboard reading, and the 12-month view.

### R2-2 follow-up: auto-moving carousel (owner request)

The owner asked for the reviews to move rather than sit in a grid. Two or more reviews now show in `TestimonialCarousel.tsx`:
- **Layout:** a horizontal, scroll-snapped strip with 3 cards per view on desktop, 2 on tablets, and 1 on phones (the next card peeks in to invite a swipe).
- **Motion:** it slides one card to the left every 6 s and loops back to the start. Every review is reachable (the disclosure is gone).
- **Controls:** Previous/Next, one dot per position, a **Pause/Play** button (WCAG 2.2.2), and native touch swipe.
- **When it pauses:** on hover, keyboard focus or touch/scroll, when off-screen and when the tab is hidden. It never moves for reduced motion.
- **When it stays still:** when every card already fits (for example 2–3 reviews on desktop), there is no movement and no controls.
- **Single review:** still the featured quote.

Tests: `testimonials.spec.ts` now checks:
- cards per view at each width;
- autoplay on/off depending on whether the cards overflow;
- automatic advance under a controlled clock, with hover pausing it;
- Next/Previous/dots, looping from the last position, and the Pause button;
- reduced motion.

## R2 defects found during this round (fixed)

| # | Severity | Defect | Fix | Test |
|---|---|---|---|---|
| R2-D1 | High | Hero images downloaded at ~half the required resolution | Correct `sizes` for cropped drawing | hero.spec "downloads images large enough…" |
| R2-D2 | Medium | Continuous rotation kept photos perpetually resampled | Step-wise auto-advance resting front-facing | hero.spec "auto-advances…" |
| R2-D3 | High | Testimonials beyond the 4th never shown | No slice; all reachable in the carousel | testimonials.spec (5, 6, 8) |
| R2-D4 | Medium | Fixed 2-column testimonial grid at all widths | Count-aware responsive layout | testimonials.spec |
| R2-D5 | Medium | Collapsed-rail tooltips clipped by the scrolling nav | `fixed` tooltip positioning | admin-ui.spec tooltips |
| R2-D6 | Medium (introduced and caught in this round) | Hydration-gated fade-in delayed LCP ~3.7 s | Image never hidden while loading | hero.spec opacity check; Lighthouse |
| R2-D7 | Low (caught before tests) | Server layout imported a constant from a `"use client"` module (would never read the cookie) | Moved to `src/lib/admin-preferences.ts`; boundary rescanned | admin-ui.spec persistence |

## R2 test results (final run)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 problems) |
| `npm test` | 74 passed (7 files) |
| `npm run test:integration` | 62 passed (8 files) |
| `npm run build` | PASS |
| `npm run test:e2e` | **55 passed** after the carousel follow-up (54 before it), 0 failed, 0 skipped: 19 new (hero 7, testimonials 7, admin UI 4, plus updated quality checks) and the earlier 36 lifecycle/regression tests |

Existing tests changed only where new UI made a selector ambiguous (the "Enquiries" link now also matches the KPI tile, and success text now also appears in the visual toast). Assertions were scoped to the sidebar link and the accessible status message; no assertion was weakened. Round-1 protections are unchanged: login throttle, consent constraint, pricing, outbox, roles, and test-database separation.

**Reproduce:** `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build && npm run test:e2e`, plus a Lighthouse homepage run against `npm start`.

## Round 3: dashboard charts, more polished and interactive (owner request)

**What changed** (`src/components/admin/charts.tsx`, new `chart-math.ts`, `src/server/dashboard.ts`, `admin/(panel)/page.tsx`, `ui.tsx`, `globals.css`):

**Enquiry trend**
- **Summary row:** total, average per day/month, busiest day/month, and the change on the previous period, in words with an arrow icon. No percentage is shown when the previous period had zero enquiries.
- **Total / By type switch.**
  - "By type" stacks Contact, Package and Custom trip, using the validated categorical slots 1–3 (blue, orange, aqua, checked with `--pairs all`).
  - Aqua is 2.77:1 against the surface, so the legend and the table view are always available.
  - Legend entries toggle each type on and off. The last visible type can't be hidden, and the colour stays with the type rather than its position.
- **Compare with previous period:** overlays a dashed neutral line (the previous 7/30/90 days or 12 months, aligned position by position), with a legend total and the previous value in the tooltip.
- **Tooltip:** shows the per-type breakdown with colour swatches, plus a highlighted hover band.
  - **Mouse:** hover to read, click to open.
  - **Keyboard:** arrow keys / Home / End read each point (announced to screen readers), Enter opens.
  - **Touch:** first tap reads, a second tap on the same point opens. Found and fixed during testing: the first tap used to navigate away immediately and the tooltip vanished.
- **Click-through:** opens that India-time day's (or month's) enquiries. This uses a new `from`/`to` received-date filter on the enquiry list and CSV export, with a visible "Received on …" chip and a "Remove date filter" link.
- **Styling:** gradient area wash, line draw-in and fade animations (off for reduced motion), dashed hairline grid, end-of-line label.
- **Axis labels:** found and fixed: the last two x-axis labels overlapped. They are now spaced by width and never collide.

**Busiest days of the week (new):** focusable columns showing value and share on hover or keyboard focus. The busiest day is labelled directly, ties are reported as ties, and it has a table view. Data comes from SQL `isodow` in India time.

**Status, packages, destinations:** bars on a soft track, with a grow-in animation, count and share on every row, and the hovered row brought forward while the others recede. Bars still link to the filtered enquiry list.

**KPI tile:** sparkline (decorative) and the change on the previous period. Tiles lift on hover.

**No invented data:**
- The previous period, weekday counts and every share are computed from PostgreSQL.
- Nothing is estimated or randomised.

**Tests:**
- **Unit, `tests/unit/chart-math.test.ts`:** scales, nice axis maximum, ticks, pointer-to-point mapping, paths, stacking order and hiding, label spacing (no end collision), summaries, percentage change (no invented percentages), shares, and day and month links (including leap years).
- **Unit, `tests/unit/charts-render.test.ts`:** server rendering of every chart (trend summary and accessible name, comparison off by default, empty-state rules, bar widths, shares, links and labels, weekday ties and empty week, ChangeNote, Sparkline, Stat).
- **Integration, `tests/integration/dashboard.test.ts` (+4):**
  - previous-period alignment across IST midnight, with spam excluded;
  - 12-month vs previous 12 months;
  - IST weekday counts across a Sunday/Monday midnight;
  - every day's click-through filter listing exactly that day's count, and the month link covering the whole month.
- **End-to-end, `tests/e2e/dashboard-charts.spec.ts` (8), against independent SQL:**
  - trend tooltips by keyboard and pointer;
  - comparison and legend;
  - by-type layers and legend toggles;
  - click/Enter opening that day's list, with filters combining and the date filter removable;
  - monthly links;
  - weekday columns, hover/focus details, bar widths, shares, hover emphasis and links;
  - every chart's table view matching its chart;
  - phone width (fits, touch tap-to-read then tap-to-open, no sideways scroll, tooltip inside the card);
  - animations on, and off for reduced motion.

**Results:**

| Check | Result |
|---|---|
| Type check | Pass |
| Lint | Pass |
| Unit | 101/101 |
| Integration | 66/66 |
| Production build | Pass |
| End-to-end | 63/63 (64/64 after adding lifecycle test C2, fixed-amount promo codes) |

## R2 remaining issues

- None in code from this round. External blockers are unchanged (§G).
- The GPU raster-scale part of the hero diagnosis cannot be demonstrated in headless CI. Worth a quick look on a real phone or laptop after deploying to staging.
