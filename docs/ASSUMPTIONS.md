# Assumptions and open business decisions

Nothing here is presented to visitors as fact unless it was published on the reference site. Where the rebuild needed a value the business has not confirmed, it either leaves the feature hidden or inactive, or uses reference content that is editable in the admin. Each item says what was done and what the business needs to decide.

| ID | Topic | What the rebuild does now | Decision needed |
|---|---|---|---|
| **A-01** | Brand spelling: the site shows "Safar With Zakia", the domain is safarwithzakiya.in | Uses "Safar With Zakia" (as displayed). Editable in Admin → Business details. | Confirm the official spelling. |
| **A-02** | **Destination daily rates** (₹3,500 / 4,500 / 4,000 / 6,000 "per day") have no stated basis, and the reference's pricing API was broken | Seeded as **inactive** rules (basis set to per person per day only as a placeholder, with a note). Visitors see "Rates on request" and the trip builder shows "Request a quote". | Confirm per person / per couple / per group / per vehicle, and what is included (the reference cards mention breakfast & dinner in Srinagar and lunch at Kongdoori). Then correct the basis and activate each rule in Admin → Destinations. |
| **A-03** | Honeymoon package ₹18,500 for "2 Adults" | Active as a **per-package price covering 2 travellers**, shown as indicative ("confirmed in your quote"). Other group sizes → quote required. Durations: 5 days / **4 nights (inferred** from the 2+2+1 day route). | Confirm the price, nights, validity/season, and the inclusions/exclusions to publish. |
| A-04 | Child pricing | Never assumed: per-person rates without a child amount give "quote required" whenever children travel. | Provide child rates if they exist. |
| A-05 | Accommodation and transport categories | Collected as **preferences only**, never priced. | Provide category price rules if estimates should include them. |
| **A-06** | The four testimonials on the reference (Vikram Singh, Ayesha Khan, Rahul Mehta, Priya Sharma) have generic names and no source | Imported as **DRAFT, consent not confirmed**. The site shows no testimonials section until some are published. | Confirm each is genuine and consented, or replace with real reviews. |
| **A-07** | "Best price guarantee" and "24/7 local support" from the reference "Why choose us" | Left out of the About page (kept: "Customised itineraries", "Responsible tourism"). | Confirm the business can honour them, then add them in Admin → Site content. |
| A-08 | Team (Zakia, Riyaz, Neha) and photos | Names and roles shown as published; the reference's stock portraits are **not** used (initials instead). | Confirm the team list; supply real photos if wanted. |
| **A-09** | Photography | 14 Creative Commons photos from Wikimedia Commons, credited on `/credits`. The business-hosted `img2.jpg` (shikaras) has unknown licensing and is not used. | Supply the business's own photos, or confirm rights to existing ones. |
| **A-10** | Legal pages | Privacy, terms and enquiry conditions describe what the software does, and are visibly marked "awaiting review". They make **no compliance claim**. | Review with a qualified adviser (e.g. India's DPDP Act 2023), set a retention period, then set `reviewed: true` in `src/content/legal.tsx`. |
| A-11 | Data retention period | Staff can archive or delete enquiries; no automatic purge. | Choose a retention period (e.g. delete closed enquiries after 24 months). A scheduled purge can then be added. |
| A-12 | Office addresses and map pin | Shown as published (lightly formatted), with a map link rather than an embedded iframe. | Confirm the addresses and pin. |
| A-13 | Destination descriptions | Short factual introductions written for the rebuild (summaries and highlights come from the reference). Best season and suggested stay left blank. | Review the wording and fill in the guidance fields. |
| A-14 | FAQs | Three FAQs describing the website's enquiry process (published). | Review the wording; add business FAQs. |
| A-15 | Business inbox and sending mailbox | Nothing configured. Emails queue as "not configured" until set. | Which Gmail/Workspace mailbox sends, and which receives? |
| A-16 | Reference "track booking by phone" | Replaced by lookup with **reference + email**, returning status only (privacy). | Confirm that this replacement is acceptable. |
| A-17 | Reference destination id 4 (missing) | Not recreated. | Was there a fifth destination (e.g. Doodhpathri, Yusmarg)? Add it in the admin if so. |
| A-18 | Enquiry statuses and transitions | New → Contacted → Quote preparation → Quote sent → Confirmed → Closed, plus Spam, with defined transitions. "Confirmed" ≠ paid booking. | Confirm this matches how the team works. |
| A-19 | Online payment | Not implemented (out of scope; no card data collected). | Separate decision if ever wanted. |
