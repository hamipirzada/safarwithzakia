# Research: the reference website

**Reference:** https://safarwithzakiya.in/
**Inspected:** 16 October 2026, by fetching every reachable public page and asset with an ordinary HTTP client and reading the HTML, inline scripts and styles. No authentication was attempted and no private paths were probed. The only API call made was the read-only price-estimate request the trip builder page itself makes, sent with harmless sample input. No booking or order was ever submitted.

Labels used below: **Observed** means seen directly in the HTML, a response or an asset. **Inferred** means a reasonable reading of the code that could not be confirmed.

## 1. Platform

| Finding | Status |
|---|---|
| PHP site on LiteSpeed (404 pages say "Proudly powered by LiteSpeed Web Server") | Observed |
| Bootstrap 5.3, Font Awesome 6.5, Swiper 11, jQuery 3.7, Lenis smooth scroll, Three.js r128, all loaded from public CDNs | Observed |
| `public/assets/js/main.js` is referenced on every page but is empty (0 bytes) | Observed |
| No `robots.txt`, no `sitemap.xml` and no favicon (all return 404) | Observed |
| `og:image` (`/public/assets/images/og-image.jpg`) and the JSON-LD logo (`/public/assets/images/logo.png`) both return 404 | Observed |
| Canonical URL is `https://` but internal links and the JSON-LD URL use `http://` | Observed |

## 2. Brand and visual identity

- **Name:** the site displays **"Safar With Zakia"** (title, logo, footer, JSON-LD, Instagram and Gmail handles). The domain spells it **"zakiya"**. *Observed.* The rebuild uses the displayed spelling and makes it editable (see ASSUMPTIONS A-01).
- **Colours:** deep navy `#071a3b` / `#1e3c72` with saffron-gold `#ffc107` accents and a light grey background `#f8f9fa`. *Observed.*
- **Type:** Poppins/Segoe UI declared, but Poppins is never loaded, so visitors see a system font. *Observed.*
- **Logo:** a Font Awesome mountain icon next to the wordmark. There is no logo file. *Observed.*
- **Style:** emoji in section titles ("🔥 Deals & Discounts 🔥"), rounded cards with hover lift, a pulsing WhatsApp button and a wave divider. *Observed.*

## 3. The "3D Kashmir experience"

The homepage hero is a full-screen Three.js scene. *Observed (inline module script).*

- A gold, metallic torus knot rotates at the centre.
- Eight textured planes orbit it, using seven Unsplash photo URLs. Four of those URLs return 404. Of the three that load, **one is Dal Lake (Kashmir), one is Varanasi's ghats and one is Boudhanath in Kathmandu.** Only one of the "3D Kashmir" images actually shows Kashmir. *Observed (downloaded and viewed).*
- 1,500 drifting particles, a translucent disc, OrbitControls with auto-rotate (no zoom or pan), a "✨" label over each plane, and a camera that moves up as the page scrolls.
- Hint text: "Drag to rotate | Scroll to explore". There is no keyboard support, no reduced-motion handling and no mobile fallback. A ~600 KB Three.js download plus a 1,500-particle render loop runs on every device.

**Conclusion:** this is decorative 3D, not a model of Kashmir. What it is for is "an interactive, rotating showcase of the destinations". The rebuild delivers that intent more cheaply and accessibly (see TECHNICAL_DECISIONS TD-07).

## 4. Pages found

| URL | Status | Notes |
|---|---|---|
| `/` (also `/index.php`) | 200 | Homepage: 3D hero, deals (empty), top places, reviews |
| `/trip-builder.php` | 200 | Custom trip builder; `?location=N` and `?package_id=N` are linked to but ignored by the page |
| `/about.php` | 200 | Story, mission/vision/why us, team, quote |
| `/contact.php` | 200 | Contact details, form, Google Maps iframe |
| `/packages.php` | 200 | Package list (1 package). **Not linked from the navigation.** |
| `/package-details.php?id=1` | 200 | "Kashmir Honeymoon Delight" |
| `/package-details.php?id=2` | 200 | 18-byte body: no package, no error page |
| `/track.php` | 200 | "Track your booking" by **phone number alone** |
| `api/calculate-trip.php` | **404** | The trip builder's price API does not exist |
| `api/submit-order.php` | not called | Referenced by the trip builder; not tested, to avoid creating a fake order |
| `package.php`, `destinations.php`, `destination.php`, `deals.php`, `privacy.php`, `terms.php`, `faq.php` | 404 | Not present |

The navigation's "Packages" link points to `/#packages`, but the homepage has no element with that id, so the link goes nowhere. *Observed.* The footer links to `index.php#packages`, which has the same problem.

## 5. Business facts published on the reference

All *observed*. Treated as published by the business, but still listed for confirmation in ASSUMPTIONS.

- **Phone / WhatsApp:** +91 8899277396 (WhatsApp pre-filled text: "Hi Zakia, I want to plan a trip to Kashmir. Please help me.")
- **Email:** safarwithzakia@gmail.com
- **Offices:** "H.Office :- Malangam bandipora pincode 193502" and "B.office :- Bismillah colony Model town E baramulla sopore pincode 193201"
- **Map:** 34.306042, 74.441391 (footer "Open in Maps" link and contact page iframe)
- **Social:** instagram.com/safarwithzakia, facebook.com/safarwithzakia, youtube.com/@safarwithzakia
- **About copy:** story, mission, vision, "Why choose us" (Customised itineraries, Best price guarantee, 24/7 local support, Responsible tourism), team (Zakia – Founder & Travel Curator, Riyaz – Operations & Guide, Neha – Customer Happiness), closing quote.

## 6. Catalogue data on the reference

**Destinations** (homepage cards and the trip builder `<select>`; database ids 1, 2, 3 and 5, so id 4 is missing or hidden):

| Name | Card text | Rate shown |
|---|---|---|
| Srinagar – Dal Lake | Shikara ride, Mughal Gardens, Houseboat stay. Includes breakfast & dinner. | From ₹3,500/day |
| Gulmarg | Gondola ride, snow skiing, meadows. Lunch included at Kongdoori. | From ₹4,500/day |
| Pahalgam | Betaab Valley, Chandanwari, Lidder River rafting | From ₹4,000/day |
| Sonmarg | Thajiwas Glacier, Zojila pass, Zero points, Fish point | From ₹6,000/day |

The rates never say whether they are **per person, per couple, per group or per vehicle**. The pricing API that would explain them returns 404. *Observed.*

**Package:** "Kashmir Honeymoon Delight", category Honeymoon, "Perfect for: 2 Adults", "Package Price ₹18,500.00", itinerary Srinagar (2 days) → Gulmarg (2 days) → Pahalgam (1 day). No inclusions, hotels or terms are published. *Observed.*

**Destination images** come from `picsum.photos` (random stock images, not Kashmir). *Observed.* Business-hosted images: `public/imgs/img1.jpg` (generic snowy peaks, 831×360) and `img2.jpg` (shikaras on Dal Lake, 3000×2000, AVIF despite the `.jpg` name). *Observed.* Their licence is unknown.

**Testimonials:** four five-star or four-star quotes from "Vikram Singh", "Ayesha Khan", "Rahul Mehta" and "Priya Sharma", with generic avatar icons and no source or date. *Observed.* They cannot be verified as genuine (ASSUMPTIONS A-06).

**Team photos** are `randomuser.me` stock portraits, not the real team. *Observed.*

**Deals:** "New deals coming soon. Stay tuned!", so none exist. *Observed.*

**Announcement bar:** "test free trail" (sic), which is test content left live. *Observed.*

## 7. Forms and integrations

| Form | Fields | Behaviour |
|---|---|---|
| Trip builder | destination + days per row (add/remove), travellers, promo code; modal asks for name, email, phone | Live price via the missing API, so it always shows "Select to calculate". Submitting needs a calculated price (`alert()` otherwise), so **in practice no trip can be submitted**. The client posts `final_price` from a hidden field, which means the price is trusted from the browser. *Observed in code.* After success it redirects to `track.php?phone=…`. *Inferred.* |
| Contact | name*, email*, phone, message* | Plain HTML `POST` to the same page. Server behaviour unknown (not submitted). *Inferred.* |
| Track | phone | Looks up "bookings" by phone number alone. Anyone who knows a phone number could see someone else's booking status (privacy risk). *Observed (form) / Inferred (data shown).* |

Other integrations: WhatsApp click-to-chat (floating button on every page) and a Google Maps iframe. There is no analytics, captcha or email integration visible client-side.

## 8. Mobile behaviour

Bootstrap's collapsing navbar is used. The Three.js hero runs on mobile with `touch-action: pan-y`. The hero heading drops to 2.5rem below 768px. *Observed from CSS; the live mobile rendering was not screenshotted, because the meaningful behaviour can be read from the code.*

## 9. Problems in the reference that the rebuild fixes

1. The trip builder cannot produce a price or submit (missing API).
2. The price would have been trusted from the browser.
3. The navigation "Packages" link is broken, and `packages.php` is not linked at all.
4. Booking lookup by phone alone leaks personal data.
5. "3D Kashmir" images that are not Kashmir; random `picsum` destination images; stock team portraits.
6. Unverifiable testimonials presented as genuine.
7. "test free trail" banner live in production.
8. Missing robots.txt, sitemap, favicon, OG image and logo; mixed http/https URLs.
9. Heavy 3D on every device with no reduced-motion or keyboard support.
10. Rates without a stated basis.

## 10. Open questions for the business

These are tracked as decisions in [ASSUMPTIONS.md](ASSUMPTIONS.md). The most important:

- Are the daily destination rates per person, per couple, per group or per vehicle? What do they include?
- What does the ₹18,500 honeymoon package include (hotels, transport, meals)? Is it valid all year?
- Which spelling is the brand: "Zakia" or "Zakiya"?
- Are the four testimonials genuine, and did the guests agree to publication?
- Is the team list current? Are there real team photos?
- Which mailbox should receive enquiries, and which should send them?
- Can the business honour "Best price guarantee" and "24/7 local support"?
