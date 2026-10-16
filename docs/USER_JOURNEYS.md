# User journeys

Each journey lists the steps, what the system guarantees, and the automated test that covers it (see [TESTING.md](TESTING.md)).

## Visitors

### V1. Explore and plan a custom trip
1. Lands on `/`. Hero: headline, "Plan your trip", "Browse packages", and the 3D destination ring (drag, swipe or arrow keys; each card links to its destination).
2. Opens a destination (`/destinations/gulmarg`): highlights, published rates **with their basis**, gallery, related packages, "Plan a trip with Gulmarg" (→ `/trip-builder?destination=gulmarg`).
3. Trip builder, step by step. Values persist when moving between steps and in a session draft:
   1. **Route**: add, remove and reorder destinations; days per stop (total ≤ 30).
   2. **Dates & travellers**: exact arrival date (not in the past, ≤ 24 months ahead) or month only; adults 1–20, children 0–10.
   3. **Preferences**: stay type, transport, interests, budget, promo code.
   4. **Details**: name, email, phone, notes, consent.
   5. **Review**: summary with "Edit" links and the server-computed estimate, or "Request a quote" with the reasons.
4. Sends. The button is disabled while sending, and each form instance has a unique submission key, so double clicks return the same enquiry.
5. Sees a success panel with the reference (e.g. `SWZ-2610-7K3QX`) **only after the enquiry is saved**. It states clearly that this is an enquiry, not a booking.

Guarantees: the server re-validates everything and re-prices from database rates (any client-sent price is ignored). The enquiry, its status history and its notification jobs are written in one transaction. Email problems never affect the result.
Tests: `e2e/enquiries.spec.ts` "completes a custom trip…", "…'Request a quote'…"; `integration/enquiries.test.ts`.

### V2. Enquire about a package
`/packages` → `/packages/kashmir-honeymoon-delight` → enquiry form (dates, travellers, stay preference, optional add-ons, contact, promo). The estimate uses the package's pricing rule (₹18,500 covers 2 travellers; any other group size → quote required).
Tests: `e2e/public.spec.ts` "views a package…", `integration/enquiries.test.ts` "package enquiries".

### V3. Send a contact message
`/contact` → name, email, optional phone, message, consent → reference shown.
Tests: `e2e/enquiries.spec.ts` contact, invalid input, spam; `e2e/mobile.spec.ts` contact on phone.

### V4. Check an enquiry
`/track` → reference + the email used → public status text only (never personal details). Wrong combinations get the same generic message. Throttled.
Test: `e2e/enquiries.spec.ts` "checks an enquiry's status…".

### V5. Talk directly
WhatsApp button (every page), phone and email links (footer, contact page, home contact strip), "Open in Google Maps".

## Staff

### S1. Sign in
`/admin/login` (generic error for any failure; throttled). Deactivated accounts cannot sign in, and existing sessions stop working immediately. "Forgot password" queues a reset email through the outbox and gives the same response whether or not the account exists.
Tests: `integration/auth.test.ts`, `e2e/admin.spec.ts`.

### S2. Handle a new enquiry
Dashboard → "New enquiries" → enquiry page: full request, original submission snapshot, estimate at submission time. Staff can:
- change the status (only allowed transitions: New → Contacted → Quote preparation → Quote sent → Confirmed → Closed; Spam ↔ New; reopen Closed). Each change is recorded with who, when and an optional note;
- add notes, assign a staff member, set a follow-up time (IST);
- see email history and retry or cancel emails;
- archive (staff) or permanently delete (admin, audited).
Tests: `e2e/admin.spec.ts` "views an enquiry, updates its status and adds a note".

### S3. Recover a failed notification
Gmail fails → the delivery stays queued with backoff (1 m, 5 m, 15 m, 1 h, 3 h) → after 6 attempts it is marked failed. The dashboard and the "Email delivery" page show the count. Staff press "Retry" (or "Send now" for queued mail) → sent once. If a send was interrupted mid-flight, the system will not resend it automatically; staff are told to check before retrying.
Tests: `e2e/admin.spec.ts` "a failed notification is recorded and can be retried by staff", `integration/outbox.test.ts`.

### S4. Maintain packages and destinations
Create (saved as draft) → edit route, day-by-day, inclusions, rates with explicit basis/season/validity, add-ons, images, SEO → publish. Publishing requires a summary, description and main image, and for packages a route of published destinations. Unpublish or archive at any time. A destination used by a published package cannot be unpublished.
Tests: `integration/catalog-admin.test.ts`, `e2e/admin.spec.ts` "edits a package…".

### S5. Content, offers, testimonials, FAQs
Edit home/about text and the announcement banner; create offers (shown on the home page only while valid and published) and promo codes; add testimonials, which can be published only after confirming they are genuine and consented (also enforced by a database constraint); manage FAQs.

### S6. Administer
Admins connect Gmail (OAuth consent), set the business inbox, toggle customer acknowledgements, send a real test email, process the queue; edit business details; manage staff (create with a one-time temporary password, change role, deactivate, reset password; the last active admin cannot be removed); read the audit log; export enquiries to CSV.

## Unauthorised visitors
`/admin/*` redirects to login. Every admin page, action and API re-checks the session and role on the server: a forged cookie gets 401 from the export endpoint, staff are refused admin-only pages, there is no public sign-up, and the cron endpoint needs its bearer secret.
Tests: `e2e/admin.spec.ts` "unauthorised visitors cannot reach admin pages or data", "staff accounts cannot open administrator-only pages".
