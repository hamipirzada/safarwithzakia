import Link from "next/link";
import { ArrowRight, MessageCircle, Phone } from "lucide-react";
import { manifestImage } from "@/content/images";
import { DestinationCard, PackageCard, SectionHeading } from "@/components/site/Cards";
import { HeroRing } from "@/components/site/HeroRing";
import { Testimonials } from "@/components/site/Testimonials";
import { Photo } from "@/components/site/Photo";
import { whatsappHref } from "@/components/site/nav";
import { listActiveOffers, listDestinations, listFaqs, listHeroRingItems, listPackages, listTestimonials } from "@/server/catalog";
import { getSetting } from "@/server/settings";

export default async function HomePage() {
  const [home, business, ringItems, destinations, packages, offers, testimonials, faqs] = await Promise.all([
    getSetting("home"),
    getSetting("business"),
    listHeroRingItems(),
    listDestinations(),
    listPackages({ take: 3 }),
    listActiveOffers(),
    listTestimonials(),
    listFaqs(),
  ]);
  const heroBackground = manifestImage("dal-lake-dusk");
  const ctaImage = manifestImage("gulmarg-snow-meadow");
  const whatsapp = whatsappHref(business.whatsappE164, business.whatsappMessage);

  // Structured data limited to facts the business publishes in its settings.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: business.name,
    url: process.env.APP_URL,
    ...(business.phoneE164 && { telephone: business.phoneE164 }),
    ...(business.email && { email: business.email }),
    ...(business.offices[0] && { address: { "@type": "PostalAddress", streetAddress: business.offices[0].address, addressRegion: "Jammu and Kashmir", addressCountry: "IN" } }),
    sameAs: [business.instagramUrl, business.facebookUrl, business.youtubeUrl].filter(Boolean),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden bg-night text-paper">
        <Photo asset={heroBackground} sizes="100vw" priority className="absolute inset-0 opacity-45" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-night via-night/80 to-night/30" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-night to-transparent" />

        <div className="container-page relative grid grid-cols-1 items-center gap-10 pt-28 pb-14 lg:min-h-[100svh] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pt-24 lg:pb-16">
          <div className="max-w-xl">
            <p className="eyebrow text-saffron">{home.heroEyebrow}</p>
            <h1 id="hero-title" className="mt-4 text-[2.75rem] leading-[1.02] font-light sm:text-[3.75rem] lg:text-[4.25rem]">
              {home.heroTitle}
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-paper/80">{home.heroSubtitle}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/trip-builder" className="btn btn-accent px-6">
                Plan your trip <ArrowRight aria-hidden size={18} />
              </Link>
              <Link href="/packages" className="btn btn-outline-on-dark px-6">
                Browse packages
              </Link>
            </div>
          </div>
          {ringItems.length >= 3 && <HeroRing items={ringItems} />}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section aria-labelledby="how-title" className="border-b border-line">
        <div className="container-page grid grid-cols-1 gap-10 py-20 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-5">
            <span className="rule-accent" />
            <h2 id="how-title" className="mt-6 text-[2rem] leading-[1.1] sm:text-[2.5rem]">
              {home.introTitle}
            </h2>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted">{home.introBody}</p>
          </div>
          <ol className="lg:col-span-6 lg:col-start-7">
            {[
              ["Choose your places", "Pick the destinations you want to see and how many days to spend in each, or start from one of our packages."],
              ["Tell us how you travel", "Dates, who is coming, the kind of stays and transport you prefer. Where rates are published you will see an indicative estimate."],
              ["Get a plan and a quote", "Our team replies personally with a route and a confirmed price. Nothing is booked until you are happy with it."],
            ].map(([title, body], index) => (
              <li key={title} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-line py-6 last:border-b">
                <span className="font-display text-2xl text-saffron-ink">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-sans text-lg font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Destinations ─────────────────────────────────────────────────── */}
      {destinations.length > 0 && (
        <section aria-labelledby="destinations-title" className="py-20 lg:py-24">
          <div className="container-page">
            <SectionHeading
              id="destinations-title"
              eyebrow="Where to go"
              title="Places we plan around"
              intro="From the lakes of Srinagar to the meadows and glaciers of the high valleys."
              action={
                <Link href="/destinations" className="btn btn-secondary">
                  All destinations
                </Link>
              }
            />
            {/* Alternating wide/narrow columns give an editorial rhythm for any number of places. */}
            <div className="mt-12 grid grid-cols-1 items-start gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-12">
              {destinations.map((d, index) => {
                const wide = index % 4 === 0 || index % 4 === 3;
                return (
                  <div key={d.id} className={wide ? "lg:col-span-7" : "lg:col-span-5"}>
                    <DestinationCard
                      size={wide ? "feature" : "default"}
                      slug={d.slug}
                      name={d.name}
                      summary={d.summary}
                      image={d.heroImage}
                      priceLabel={d.priceLabel}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Offers (only when the business has published some) ───────────── */}
      {offers.length > 0 && (
        <section aria-labelledby="offers-title" className="border-y border-line bg-saffron-soft/50 py-16">
          <div className="container-page">
            <SectionHeading id="offers-title" eyebrow="Current offers" title="Seasonal offers" />
            <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {offers.map((offer) => (
                <li key={offer.id} className="flex flex-col rounded-sm border border-line-strong/60 bg-surface p-6">
                  {offer.discountLabel && <p className="eyebrow">{offer.discountLabel}</p>}
                  <h3 className="mt-2 text-xl leading-snug">{offer.title}</h3>
                  <p className="mt-2 flex-1 leading-relaxed text-muted">{offer.description}</p>
                  {offer.promoCode && (
                    <p className="mt-4 text-sm">
                      Use code <span className="rounded-xs bg-paper-deep px-1.5 py-0.5 font-mono font-semibold">{offer.promoCode.code}</span>
                    </p>
                  )}
                  {offer.validTo && <p className="mt-2 text-xs text-muted">Valid until {offer.validTo.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}</p>}
                  <Link href={offer.package?.status === "PUBLISHED" ? `/packages/${offer.package.slug}` : "/trip-builder"} className="link mt-4 text-sm font-semibold">
                    {offer.package?.status === "PUBLISHED" ? `See ${offer.package.title}` : "Plan a trip with this offer"}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Packages ─────────────────────────────────────────────────────── */}
      {packages.length > 0 && (
        <section aria-labelledby="packages-title" className="bg-paper-deep/60 py-20 lg:py-24">
          <div className="container-page">
            <SectionHeading
              id="packages-title"
              eyebrow="Ready-made routes"
              title="Packages to start from"
              intro="Fixed routes you can take as they are or adjust. Prices shown are the published starting price; your quote confirms the details."
              action={
                <Link href="/packages" className="btn btn-secondary">
                  All packages
                </Link>
              }
            />
            <div className="mt-12 space-y-8">
              {packages.map((p) => (
                <PackageCard
                  key={p.id}
                  slug={p.slug}
                  title={p.title}
                  category={p.category}
                  summary={p.summary}
                  durationDays={p.durationDays}
                  durationNights={p.durationNights}
                  idealFor={p.idealFor}
                  route={p.destinations.map((d) => d.destination.name)}
                  image={p.heroImage}
                  priceLabel={p.priceLabel}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Trip builder band ────────────────────────────────────────────── */}
      <section aria-labelledby="builder-title" className="relative overflow-hidden bg-night text-paper">
        <Photo asset={ctaImage} sizes="100vw" className="absolute inset-0 opacity-35" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-night via-night/85 to-night/40" />
        <div className="container-page relative py-20 lg:py-28">
          <div className="max-w-xl">
            <p className="eyebrow text-saffron">Custom trip builder</p>
            <h2 id="builder-title" className="mt-4 text-[2.25rem] leading-[1.08] font-light sm:text-[3rem]">
              Build your own route, day by day
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-paper/80">
              Add destinations in the order you want to travel, choose how long to stay, and send it to us. You get a reference number straight away.
            </p>
            <Link href="/trip-builder" className="btn btn-on-dark mt-8 px-6">
              Start building <ArrowRight aria-hidden size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials (only verified, authorised reviews are published) ─ */}
      <Testimonials items={testimonials.map((t) => ({ id: t.id, authorName: t.authorName, location: t.location, quote: t.quote, rating: t.rating }))} />

      {/* ── FAQs ─────────────────────────────────────────────────────────── */}
      {faqs.length > 0 && (
        <section aria-labelledby="faq-title" className="border-t border-line py-20 lg:py-24">
          <div className="container-page grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="faq-title" className="text-[2rem] leading-tight sm:text-[2.5rem]">
                Questions, answered
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Something else? <Link href="/contact" className="link">Send us a message</Link>.
              </p>
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              {faqs.map((faq) => (
                <details key={faq.id} className="group border-b border-line py-5 first:border-t">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <span aria-hidden className="mt-1 text-xl leading-none text-saffron-ink transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl leading-relaxed text-muted">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Contact strip ────────────────────────────────────────────────── */}
      <section aria-label="Contact" className="border-t border-line bg-surface">
        <div className="container-page flex flex-col gap-6 py-12 md:flex-row md:items-center md:justify-between">
          <p className="font-display text-2xl text-ink">Rather talk it through?</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {business.phoneE164 && (
              <a href={`tel:${business.phoneE164}`} className="btn btn-secondary">
                <Phone aria-hidden size={17} /> {business.phone}
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <MessageCircle aria-hidden size={17} /> WhatsApp
              </a>
            )}
            <Link href="/contact" className="btn btn-primary">
              Send a message
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
