# Page inventory

Part 1 records the reference site as inspected; part 2 lists the routes of the rebuild. For each reference page: purpose, sections in order, interactions, inputs, destinations, mobile, errors, and backend dependencies. "Obs." = observed, "Inf." = inferred.

## Part 1 — Reference site (safarwithzakiya.in)

### Shared chrome (every page) — Obs.
- Gold announcement bar: "test free trail".
- Navbar (absolute, translucent): logo "Safar With Zakia" → `/`; Home, Packages (`/#packages`, **broken anchor**), Custom Trip (`trip-builder.php`), About, Contact. Collapses to a hamburger below `lg`.
- Floating "Chat on WhatsApp" pill, bottom-right, pulsing, `wa.me/918899277396` with prefilled text.
- Footer (navy, gold top border): brand blurb + "Open in Maps"; Quick links (Popular Packages → `index.php#packages` broken, 3D Custom Trip Builder, About, Contact); Get in touch (phone, email, Instagram); © 2026.
- JSON-LD `TravelAgency` with both office addresses inside `streetAddress`, locality "Srinagar".

### `/` Homepage
| | |
|---|---|
| Purpose | Brand impression, destinations, entry to trip builder |
| Sections | 1. Three.js hero "Experience Kashmir in 3D" + "Plan Your Trip →" (→ trip builder) + "Drag to rotate \| Scroll to explore"; wave divider. 2. "🔥 Deals & Discounts 🔥" — empty state "New deals coming soon". 3. "🏔️ Top Places in Kashmir 🏔️" — 4 cards (image, name, description, "From ₹X/day", "Explore" → `trip-builder.php?location=N`) + "Build Your Custom Trip →". 4. "❤️ Traveler Stories ❤️" — Swiper carousel of 4 reviews, autoplay 3.5 s, 1/2/3 per view. |
| Interactions | Orbit drag on canvas; scroll-linked camera; scroll-reveal animations; carousel autoplay/pagination |
| Inputs | None |
| Backend | Deals, places and reviews rendered from a database (Inf. from PHP + ids) |
| Mobile | Hero h1 2.5 rem; 3D still runs; cards stack |
| Errors | 4 of 7 hero texture URLs 404 (planes render blank) |

### `/trip-builder.php`
| | |
|---|---|
| Purpose | Build a custom route and request a booking |
| Sections | Hero "Build Your Dream Trip"; left card "Plan Your Route" (rows: destination select with price, days number, remove ✕; "+ Add Destination"); "Trip Details" (travellers number, promo code + Apply); right sticky "Estimate" card (₹ total, breakdown, "Request Booking →"); modal "Complete Your Request" (name, email, phone, "Submit Booking Request") |
| Validation | HTML `min=1`; JS `alert()` if no price; `alert("Please fill all details.")` for empty modal fields |
| Backend | `POST api/calculate-trip.php` (**404**) on every change; `POST api/submit-order.php` with client-side `final_price` and `localStorage` itinerary; redirect to `track.php?phone=` |
| Query params | `location`, `package_id` linked from other pages but ignored |
| Errors | Estimate permanently shows "Select to calculate"; submission impossible |

### `/about.php`
Hero "About Safar With Zakia"; "Our Story" (image `public/imgs/img1.jpg` + 2 paragraphs); three cards Mission / Vision / Why Choose Us (4 bullets); "Meet the Team" (3 × randomuser.me portrait, name, role); dark quote band "— Zakia & Team". Fade-up reveal. No inputs.

### `/contact.php`
Hero "Get in Touch"; "Contact Info" card (offices, phone listed twice, email, Facebook/Instagram/YouTube); "Send us a message" form (Full Name*, Email*, Phone, Message*; `method=POST` to self); "Find Us On The Map" Google Maps iframe at 34.306042, 74.441391. Validation via HTML `required` only (Obs.). Server handling unknown (Inf.).

### `/packages.php` (unlinked)
Hero "Our Travel Packages"; one card: badge "Honeymoon", "Kashmir Honeymoon Delight", "2 Adults", "Starting from ₹18,500.00", "View Details →" (`package-details.php?id=1`).

### `/package-details.php?id=1`
Badge, title; "Perfect for: 2 Adults"; "Package Price ₹18,500.00"; "Tour Itinerary" list (Srinagar – Dal Lake 2 days; Gulmarg 2 days; Pahalgam 1 day); "Book This Package" (→ `trip-builder.php?package_id=1`, ignored) and "Back to Packages". Unknown id → near-empty 200 response (no 404).

### `/track.php`
"Track Your Booking"; phone input + "Track Status" (GET). Unknown phone → "No active bookings found for {phone}" + link to build a trip. Lookup by phone alone (privacy issue).

## Part 2 — Rebuild routes

### Public
| Route | Purpose | Data source |
|---|---|---|
| `/` | Hero + interactive 3D destination ring, how it works, destinations, offers (if any), packages, trip-builder band, testimonials (if verified), FAQs, contact strip | DB: destinations, packages, offers, testimonials, FAQs, settings |
| `/destinations` | All published destinations | DB |
| `/destinations/[slug]` | Story, highlights, published rates with basis, gallery, related packages, "Plan a trip with …" | DB |
| `/packages` | All published packages | DB |
| `/packages/[slug]` | Facts, route, day-by-day, inclusions, practical info, pricing basis, gallery, enquiry form, related | DB |
| `/trip-builder` (`?destination=slug`) | 5-step custom trip builder with live server estimate | DB |
| `/about` | Story, mission, vision, values, team, quote | Settings (editable) |
| `/contact` | Contact form + contact details + map link | Settings |
| `/track` | Enquiry status by reference **and** email | DB |
| `/privacy`, `/terms`, `/booking-conditions` | Policy pages describing actual system behaviour (marked "awaiting review") | Code |
| `/credits` | Photo licences and authors | DB media |
| `/sitemap.xml`, `/robots.txt` | SEO | DB / code |
| 404 | Helpful not-found page with next steps | — |
| Legacy `.php` URLs | Permanent redirects (incl. `trip-builder.php?location=N` → `?destination=slug`, `package-details.php?id=1` → package slug) | config |

### Admin (all server-authorised; see SECURITY.md)
| Route | Role | Purpose |
|---|---|---|
| `/admin/login`, `/admin/forgot-password`, `/admin/reset-password` | public | Staff sign-in and password reset |
| `/admin` | Staff | Counts, follow-ups due, failed emails, recent enquiries, by status, most requested |
| `/admin/enquiries` | Staff | Search, filters (view/status/type/assignee), pagination; CSV export (Admin) |
| `/admin/enquiries/[id]` | Staff | Full record, original snapshot, estimate, status transitions + history, notes, assignment, follow-up, email history with retry/cancel, archive; delete (Admin) |
| `/admin/packages`, `/new`, `/[id]/edit` | Staff | Full package editor; publish / unpublish / archive |
| `/admin/destinations`, `/new`, `/[id]/edit` | Staff | Destination editor incl. rates; publish / archive |
| `/admin/offers` | Staff | Offers and promo codes |
| `/admin/testimonials` | Staff | Reviews; publish only with consent confirmed |
| `/admin/faqs` | Staff | FAQs |
| `/admin/content` | Staff | Home text, About page, announcement banner |
| `/admin/email-settings` | Admin | Gmail connection, recipient, acknowledgement toggle, test email, queue, failures |
| `/admin/settings` | Admin | Business details (contact, offices, social) |
| `/admin/staff` | Admin | Create accounts, roles, deactivate, reset passwords |
| `/admin/audit` | Admin | Audit log |

### API
| Route | Auth | Purpose |
|---|---|---|
| `/api/auth/*` | Better Auth | Sign-in/out, session, password reset (sign-up disabled) |
| `/api/admin/gmail/connect`, `/callback` | Admin session + OAuth state cookie | Connect business mailbox |
| `/api/cron/email-outbox` | `Bearer EMAIL_WORKER_SECRET` | Scheduled outbox processing |
| `/admin/enquiries/export` | Admin session | CSV export |
