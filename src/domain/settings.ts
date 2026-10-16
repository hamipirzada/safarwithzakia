/**
 * Editable site settings and content blocks, stored as JSON rows in `site_setting`.
 * Each key has a zod schema; anything read from the database is validated and falls back
 * to the defaults below if missing or malformed.
 *
 * Defaults marked "reference" were published on https://safarwithzakiya.in/ (inspected
 * 16 Oct 2026). They should still be confirmed by the business — see docs/ASSUMPTIONS.md.
 */

import { z } from "zod";

// No runtime code generation: keeps validation compatible with the strict Content-Security-Policy.
z.config({ jitless: true });

const optionalUrl = z.union([z.literal(""), z.url({ protocol: /^https$/ })]);
const text = (max: number) => z.string().trim().max(max);

export const businessSchema = z.object({
  name: text(80).min(2),
  tagline: text(160),
  phone: text(30), // display form, e.g. "+91 88992 77396"
  phoneE164: z.union([z.literal(""), z.string().regex(/^\+[1-9]\d{7,14}$/)]),
  whatsappE164: z.union([z.literal(""), z.string().regex(/^\+[1-9]\d{7,14}$/)]),
  whatsappMessage: text(300),
  email: z.union([z.literal(""), z.email()]),
  offices: z.array(z.object({ label: text(60), address: text(300) })).max(4),
  mapUrl: optionalUrl,
  instagramUrl: optionalUrl,
  facebookUrl: optionalUrl,
  youtubeUrl: optionalUrl,
});
export type BusinessSettings = z.infer<typeof businessSchema>;

export const announcementSchema = z.object({
  enabled: z.boolean(),
  message: text(160),
  linkHref: z.union([z.literal(""), z.string().regex(/^\/[^\s]*$/, "Use an internal path such as /offers")]),
  linkLabel: text(40),
});
export type AnnouncementSettings = z.infer<typeof announcementSchema>;

export const homeContentSchema = z.object({
  heroEyebrow: text(80),
  heroTitle: text(120).min(3),
  heroSubtitle: text(300),
  introTitle: text(120),
  introBody: text(1200),
});
export type HomeContent = z.infer<typeof homeContentSchema>;

export const aboutContentSchema = z.object({
  title: text(120).min(3),
  lead: text(300),
  story: z.array(text(1500)).max(6),
  mission: text(600),
  vision: text(600),
  values: z.array(text(80)).max(8),
  team: z.array(z.object({ name: text(60), role: text(80) })).max(12),
  quote: text(400),
  quoteAttribution: text(80),
});
export type AboutContent = z.infer<typeof aboutContentSchema>;

export const emailSettingsSchema = z.object({
  /** Business inbox that receives enquiry notifications (overrides ENQUIRY_RECIPIENT_EMAIL when set). */
  recipientEmail: z.union([z.literal(""), z.email()]),
  sendCustomerAcknowledgement: z.boolean(),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;

export const SETTINGS = {
  business: {
    schema: businessSchema,
    defaults: {
      name: "Safar With Zakia", // reference: displayed brand name (the domain spells "Zakiya")
      tagline: "Custom Kashmir journeys planned by a local team.",
      phone: "+91 88992 77396", // reference
      phoneE164: "+918899277396", // reference
      whatsappE164: "+918899277396", // reference
      whatsappMessage: "Hi Zakia, I want to plan a trip to Kashmir. Please help me.", // reference
      email: "safarwithzakia@gmail.com", // reference
      offices: [
        // reference (contact page), lightly formatted
        { label: "Head office", address: "Malangam, Bandipora, Jammu & Kashmir 193502" },
        { label: "Branch office", address: "Bismillah Colony, Model Town E, Sopore, Baramulla, Jammu & Kashmir 193201" },
      ],
      mapUrl: "https://maps.google.com/?q=34.306042,74.441391", // reference (footer "Open in Maps")
      instagramUrl: "https://www.instagram.com/safarwithzakia", // reference
      facebookUrl: "https://www.facebook.com/safarwithzakia", // reference
      youtubeUrl: "https://www.youtube.com/@safarwithzakia", // reference
    },
  },
  announcement: {
    schema: announcementSchema,
    defaults: { enabled: false, message: "", linkHref: "", linkLabel: "" },
  },
  home: {
    schema: homeContentSchema,
    defaults: {
      heroEyebrow: "Kashmir, planned by locals",
      heroTitle: "Experience Kashmir, your way",
      heroSubtitle:
        "Houseboats on Dal Lake, the meadows of Gulmarg and Pahalgam, the glacier at Sonmarg — tell us how you like to travel and we will plan the route around you.",
      introTitle: "Trips shaped around you, not a brochure",
      introBody:
        "Choose the places you want to see and how long you want in each. We reply with a plan and a quote — nothing is booked until you are happy with it.",
    },
  },
  about: {
    schema: aboutContentSchema,
    defaults: {
      title: "About Safar With Zakia", // reference
      lead: "Your trusted gateway to the paradise on earth – Kashmir", // reference
      story: [
        // reference ("Our Story")
        "Founded by Zakia, a passionate traveller and local expert, Safar With Zakia was born from a deep love for Kashmir’s breathtaking landscapes and warm hospitality. What started as a small initiative to help friends discover hidden gems has now grown into a full‑fledged travel agency dedicated to crafting authentic, unforgettable experiences.",
        "We believe that travel is not just about visiting places – it’s about connecting with cultures, creating memories, and feeling the magic of the Himalayas. Every trip we design is personal, flexible, and rooted in local knowledge.",
      ],
      mission:
        "To provide seamless, safe, and enriching travel experiences that showcase the true essence of Kashmir – its valleys, lakes, culture, and people.", // reference
      vision:
        "To become the most trusted name for Kashmir travel, known for authenticity, transparency, and creating truly unforgettable journeys.", // reference
      // reference lists also "Best price guarantee" and "24/7 local support"; withheld until the
      // business confirms it can honour those commitments (docs/ASSUMPTIONS.md A-07).
      values: ["Customised itineraries", "Responsible tourism"],
      team: [
        // reference ("Meet the Team"); the reference used stock portrait photos, which are not shown.
        { name: "Zakia", role: "Founder & Travel Curator" },
        { name: "Riyaz", role: "Operations & Guide" },
        { name: "Neha", role: "Customer Happiness" },
      ],
      quote:
        "We don’t just sell trips; we share the soul of Kashmir. Every journey with us is a step closer to discovering the untouched magic of the mountains.", // reference
      quoteAttribution: "Zakia & Team", // reference
    },
  },
  email: {
    schema: emailSettingsSchema,
    defaults: { recipientEmail: "", sendCustomerAcknowledgement: true },
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;
