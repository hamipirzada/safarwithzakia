/**
 * Seed data. Idempotent: safe to run repeatedly (upserts by slug/path/key).
 *
 * Only content verified on the reference site (https://safarwithzakiya.in/, inspected
 * 16 Oct 2026) is published. Anything the business has not confirmed is seeded as DRAFT
 * or inactive, with a note explaining what needs checking (docs/ASSUMPTIONS.md).
 *
 * Usage: npm run db:seed
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type PricingBasis } from "../src/generated/prisma/client";
import { IMAGE_MANIFEST, type ImageKey } from "../src/content/images";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function seedMedia(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const image of IMAGE_MANIFEST) {
    const row = await prisma.mediaAsset.upsert({
      where: { path: image.path },
      create: { path: image.path, alt: image.alt, width: image.width, height: image.height, credit: image.credit, license: image.license, licenseUrl: image.licenseUrl, sourceUrl: image.sourceUrl },
      update: { alt: image.alt, width: image.width, height: image.height, credit: image.credit, license: image.license, licenseUrl: image.licenseUrl, sourceUrl: image.sourceUrl },
    });
    ids.set(image.key, row.id);
  }
  return ids;
}

interface DestinationSeed {
  slug: string;
  name: string;
  region: string;
  summary: string;
  description: string;
  attractions: string[];
  hero: ImageKey;
  gallery: ImageKey[];
  /** Rate published on the reference site, in rupees per day. Basis was not stated. */
  referenceDailyRupees: number;
  referenceNote: string;
}

// Summaries and attraction lists come from the reference destination cards. Descriptions are
// short factual introductions written for this rebuild and should be reviewed by the business.
const DESTINATIONS: DestinationSeed[] = [
  {
    slug: "srinagar-dal-lake",
    name: "Srinagar – Dal Lake",
    region: "Srinagar",
    summary: "Shikara rides on Dal Lake, the Mughal Gardens and a night on a traditional houseboat.",
    description:
      "Srinagar, the summer capital of Jammu & Kashmir, sits around Dal Lake. Days here move at the pace of the water: shikara rides past floating markets and carved cedar houseboats, and walks through the terraced Mughal gardens laid out along the lake's eastern shore.",
    attractions: ["Shikara ride", "Mughal Gardens", "Houseboat stay"],
    hero: "dal-lake-dusk",
    gallery: ["dal-lake-houseboats", "dal-lake-floating-market", "shalimar-bagh"],
    referenceDailyRupees: 3500,
    referenceNote: 'Reference card: "From ₹3,500/day" and "Includes breakfast & dinner".',
  },
  {
    slug: "gulmarg",
    name: "Gulmarg",
    region: "Baramulla",
    summary: "Gondola rides, snow skiing in winter and open meadows in summer.",
    description:
      "Gulmarg is a high meadow in the Pir Panjal range west of Srinagar. In winter it is one of India's best-known places for snow; in summer the same slopes turn to grassland. The Gulmarg Gondola climbs from the meadow to Kongdoori and beyond.",
    attractions: ["Gondola ride", "Snow skiing", "Meadows", "Kongdoori"],
    hero: "gulmarg-snow-meadow",
    gallery: ["gulmarg-kongdoori", "gulmarg-sunset"],
    referenceDailyRupees: 4500,
    referenceNote: 'Reference card: "From ₹4,500/day" and "Lunch included at Kongdoori".',
  },
  {
    slug: "pahalgam",
    name: "Pahalgam",
    region: "Anantnag",
    summary: "Betaab Valley, Chandanwari and rafting on the Lidder River.",
    description:
      "Pahalgam lies where the Lidder River leaves the mountains, surrounded by pine forest and side valleys. Betaab Valley and Chandanwari are reached by road from the town, and the river itself is used for rafting in the warmer months.",
    attractions: ["Betaab Valley", "Chandanwari", "Lidder River rafting"],
    hero: "pahalgam-valley",
    gallery: ["pahalgam-lidder-river", "betaab-valley", "pahalgam-forest-trail"],
    referenceDailyRupees: 4000,
    referenceNote: 'Reference card: "From ₹4,000/day".',
  },
  {
    slug: "sonmarg",
    name: "Sonmarg",
    region: "Ganderbal",
    summary: "Thajiwas Glacier, Zojila Pass, Zero Point and Fish Point.",
    description:
      "Sonmarg, the \"meadow of gold\", sits on the Sindh River on the road towards Zojila Pass and Ladakh. The Thajiwas Glacier is a short distance from the meadow, and the high road beyond leads to Zero Point.",
    attractions: ["Thajiwas Glacier", "Zojila Pass", "Zero Point", "Fish Point"],
    hero: "sonamarg-thajiwas",
    gallery: ["thajiwas-glacier", "sonamarg-autumn"],
    referenceDailyRupees: 6000,
    referenceNote: 'Reference card: "From ₹6,000/day".',
  },
];

async function seedDestinations(media: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [index, d] of DESTINATIONS.entries()) {
    const destination = await prisma.destination.upsert({
      where: { slug: d.slug },
      create: {
        slug: d.slug,
        name: d.name,
        region: d.region,
        summary: d.summary,
        description: d.description,
        heroImageId: media.get(d.hero)!,
        status: "PUBLISHED",
        sortOrder: index,
      },
      update: {},
    });
    ids.set(d.slug, destination.id);

    if ((await prisma.attraction.count({ where: { destinationId: destination.id } })) === 0) {
      await prisma.attraction.createMany({ data: d.attractions.map((name, position) => ({ destinationId: destination.id, name, position })) });
    }
    if ((await prisma.destinationImage.count({ where: { destinationId: destination.id } })) === 0) {
      await prisma.destinationImage.createMany({ data: d.gallery.map((key, position) => ({ destinationId: destination.id, mediaId: media.get(key)!, position })) });
    }
    if ((await prisma.pricingRule.count({ where: { destinationId: destination.id } })) === 0) {
      // Inactive until the business confirms whether the published daily rate is per person or
      // per group/vehicle. While inactive the trip builder shows "Request a quote".
      const basis: PricingBasis = "PER_PERSON_PER_DAY";
      await prisma.pricingRule.create({
        data: {
          destinationId: destination.id,
          label: "Standard daily rate",
          basis,
          amountPaise: d.referenceDailyRupees * 100,
          active: false,
          notes: `${d.referenceNote} Imported from the previous website. The basis (per person or per group) was not stated — confirm and correct it before activating.`,
        },
      });
    }
  }
  return ids;
}

async function seedPackage(media: Map<string, string>, destinations: Map<string, string>): Promise<void> {
  const slug = "kashmir-honeymoon-delight";
  if (await prisma.package.findUnique({ where: { slug } })) return;

  await prisma.$transaction(async (tx) => {
    // Reference: package-details.php?id=1 — title, "Honeymoon", "Perfect for: 2 Adults",
    // "Package Price ₹18,500.00", route Srinagar (2 days) → Gulmarg (2 days) → Pahalgam (1 day).
    const pkg = await tx.package.create({
      data: {
        slug,
        title: "Kashmir Honeymoon Delight",
        category: "Honeymoon",
        summary: "Five days for two through Srinagar, Gulmarg and Pahalgam.",
        description:
          "A route for couples that begins on Dal Lake in Srinagar, spends two days in the meadows of Gulmarg and finishes in the valley of Pahalgam. Share your dates and preferences and we will confirm the stays and transport in your quote.",
        durationDays: 5,
        durationNights: 4,
        idealFor: "2 adults",
        heroImageId: media.get("dal-lake-houseboats")!,
        status: "PUBLISHED",
        featured: true,
        publishedAt: new Date(),
      },
    });
    const route: [string, number][] = [
      ["srinagar-dal-lake", 2],
      ["gulmarg", 2],
      ["pahalgam", 1],
    ];
    await tx.packageDestination.createMany({
      data: route.map(([destinationSlug, days], position) => ({ packageId: pkg.id, destinationId: destinations.get(destinationSlug)!, position, days })),
    });
    await tx.packageImage.createMany({
      data: (["dal-lake-dusk", "gulmarg-snow-meadow", "pahalgam-valley"] as const).map((key, position) => ({ packageId: pkg.id, mediaId: media.get(key)!, position })),
    });
    await tx.pricingRule.create({
      data: {
        packageId: pkg.id,
        label: "Published package price",
        basis: "PER_PACKAGE",
        amountPaise: 18_500_00,
        includedTravellers: 2,
        active: true,
        notes: 'Reference: "Package Price ₹18,500.00", "Perfect for: 2 Adults". Inclusions were not published; confirm what this price covers.',
      },
    });
  });
}

async function seedTestimonials(): Promise<void> {
  if ((await prisma.testimonial.count()) > 0) return;
  // These four reviews appeared on the reference homepage with generic names and no source.
  // They stay DRAFT until staff confirm each is genuine and the guest agreed to publication.
  const reviews: [string, number, string][] = [
    ["Vikram Singh", 5, "Smooth booking, excellent cab services, and the hotels were top-notch. Thank you Zakia!"],
    ["Ayesha Khan", 4, "Wonderful experience. The guides were knowledgeable and the itinerary was well-paced. Will book again."],
    ["Rahul Mehta", 5, "Best travel agency for Kashmir. Customized our honeymoon, great support, and fair pricing. Highly recommend!"],
    ["Priya Sharma", 5, "An unforgettable Kashmir trip! The houseboat stay and Gulmarg snow were magical. Safar With Zakia planned everything perfectly."],
  ];
  await prisma.testimonial.createMany({
    data: reviews.map(([authorName, rating, quote], sortOrder) => ({
      authorName,
      rating,
      quote,
      sortOrder,
      status: "DRAFT",
      consentConfirmed: false,
      source: "Imported from the previous website — verify before publishing",
    })),
  });
}

async function seedFaqs(): Promise<void> {
  if ((await prisma.faq.count()) > 0) return;
  // These describe how this website's enquiry process works; review the wording with the business.
  const faqs: [string, string][] = [
    [
      "Is submitting an enquiry the same as booking?",
      "No. An enquiry tells us what you would like. Our team replies with a plan and a quote, and nothing is reserved until you have agreed it with us. This website does not take payments.",
    ],
    [
      "How is the estimate in the trip builder worked out?",
      "When published rates exist for your destinations and dates, the trip builder adds them up using the basis shown (for example per person, per day). It is an indicative estimate, not a confirmed price — we confirm the final amount in your quote. Where rates depend on details we do not have yet, you will see \"Request a quote\" instead of a number.",
    ],
    [
      "What happens after I send my enquiry?",
      "You will see a reference number straight away. A member of the team reviews every enquiry and replies by email, phone or WhatsApp. Please quote your reference if you contact us.",
    ],
  ];
  await prisma.faq.createMany({ data: faqs.map(([question, answer], sortOrder) => ({ question, answer, sortOrder, status: "PUBLISHED" })) });
}

async function main(): Promise<void> {
  const media = await seedMedia();
  const destinations = await seedDestinations(media);
  await seedPackage(media, destinations);
  await seedTestimonials();
  await seedFaqs();
  console.log(`Seeded ${media.size} images, ${destinations.size} destinations, 1 package, testimonials (draft) and FAQs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
