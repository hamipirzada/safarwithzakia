import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { formatINR } from "@/domain/money";
import { BASIS_LABELS } from "@/domain/pricing";
import { PackageCard } from "@/components/site/Cards";
import { Photo } from "@/components/site/Photo";
import { PackageEnquiryForm } from "@/components/forms/PackageEnquiryForm";
import { getPackage } from "@/server/catalog";

export async function generateMetadata({ params }: PageProps<"/packages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPackage(slug);
  if (!p) return { title: "Package not found" };
  return {
    title: p.seoTitle ?? p.title,
    description: p.seoDescription ?? p.summary,
    alternates: { canonical: `/packages/${p.slug}` },
    openGraph: p.heroImage ? { images: [{ url: p.heroImage.path, width: p.heroImage.width, height: p.heroImage.height, alt: p.heroImage.alt }] } : undefined,
  };
}

function TextBlock({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <section className="mt-10">
      <h2 className="text-2xl">{title}</h2>
      <p className="prose-safar mt-3 whitespace-pre-line">{body}</p>
    </section>
  );
}

export default async function PackagePage({ params }: PageProps<"/packages/[slug]">) {
  const { slug } = await params;
  const p = await getPackage(slug);
  if (!p) notFound();

  const included = p.features.filter((f) => f.kind === "INCLUDED");
  const excluded = p.features.filter((f) => f.kind === "EXCLUDED");
  const route = p.destinations.filter((d) => d.destination.status === "PUBLISHED");

  return (
    <article>
      <header className="relative bg-night text-paper">
        <Photo asset={p.heroImage} sizes="100vw" priority showCredit className="absolute inset-0" fallbackLabel={p.title} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night via-night/45 to-night/10" />
        <div className="container-page relative flex min-h-[24rem] flex-col justify-end pt-24 pb-12 sm:min-h-[30rem]">
          <nav aria-label="Breadcrumb" className="text-sm text-paper/70">
            <Link href="/packages" className="hover:text-paper">
              Packages
            </Link>{" "}
            / <span aria-current="page">{p.title}</span>
          </nav>
          {p.category && <p className="eyebrow mt-4 text-saffron">{p.category}</p>}
          <h1 className="mt-2 text-[2.5rem] leading-[1.04] font-light sm:text-[3.75rem]">{p.title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-paper/85">{p.summary}</p>
        </div>
      </header>

      <div className="container-page grid grid-cols-1 gap-12 py-14 lg:grid-cols-12 lg:py-20">
        <div className="lg:col-span-7">
          <dl className="grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted">Duration</dt>
              <dd className="mt-1 text-lg text-ink">
                {p.durationDays} days / {p.durationNights} nights
              </dd>
            </div>
            {p.idealFor && (
              <div>
                <dt className="text-sm text-muted">Suited to</dt>
                <dd className="mt-1 text-lg text-ink">{p.idealFor}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted">Price</dt>
              <dd className="mt-1 text-lg text-ink">{p.priceLabel ?? "On request"}</dd>
            </div>
          </dl>

          <div className="prose-safar mt-10">
            {p.description.split(/\n{2,}/).map((para) => (
              <p key={para.slice(0, 40)}>{para}</p>
            ))}
          </div>

          {route.length > 0 && (
            <section aria-labelledby="route" className="mt-12">
              <h2 id="route" className="text-2xl">
                Route
              </h2>
              <ol className="mt-5 border-l border-line-strong pl-6">
                {route.map((stop, index) => (
                  <li key={stop.id} className="relative pb-6 last:pb-0">
                    <span aria-hidden className="absolute top-1.5 -left-[1.95rem] h-3 w-3 rounded-full border-2 border-saffron bg-paper" />
                    <p className="text-sm text-muted">Stop {index + 1}</p>
                    <p className="text-lg text-ink">
                      <Link href={`/destinations/${stop.destination.slug}`} className="hover:underline">
                        {stop.destination.name}
                      </Link>{" "}
                      <span className="text-base text-muted">· {stop.days} day{stop.days === 1 ? "" : "s"}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {p.itinerary.length > 0 && (
            <section aria-labelledby="itinerary" className="mt-12">
              <h2 id="itinerary" className="text-2xl">
                Day by day
              </h2>
              <ol className="mt-5 divide-y divide-line border-y border-line">
                {p.itinerary.map((day) => (
                  <li key={day.id} className="grid grid-cols-1 gap-2 py-5 sm:grid-cols-[5rem_1fr]">
                    <p className="font-display text-saffron-ink">Day {day.dayNumber}</p>
                    <div>
                      <h3 className="font-sans font-semibold text-ink">{day.title}</h3>
                      <p className="mt-1 whitespace-pre-line text-muted">{day.description}</p>
                      {day.overnight && <p className="mt-2 text-sm text-ink-soft">Overnight: {day.overnight}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {(included.length > 0 || excluded.length > 0) && (
            <section aria-label="Inclusions and exclusions" className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2">
              {included.length > 0 && (
                <div>
                  <h2 className="text-xl">Included</h2>
                  <ul className="mt-4 space-y-2.5">
                    {included.map((f) => (
                      <li key={f.id} className="flex gap-2.5 text-ink-soft">
                        <Check aria-hidden size={18} className="mt-0.5 shrink-0 text-success" /> {f.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {excluded.length > 0 && (
                <div>
                  <h2 className="text-xl">Not included</h2>
                  <ul className="mt-4 space-y-2.5">
                    {excluded.map((f) => (
                      <li key={f.id} className="flex gap-2.5 text-ink-soft">
                        <X aria-hidden size={18} className="mt-0.5 shrink-0 text-danger" /> {f.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <TextBlock title="Accommodation" body={p.accommodationInfo} />
          <TextBlock title="Transport" body={p.transportInfo} />
          <TextBlock title="Availability" body={p.availabilityNotes} />
          <TextBlock title="Cancellation" body={p.cancellationPolicy} />

          {p.rateRules.length > 0 && (
            <section aria-labelledby="pricing" className="mt-12">
              <h2 id="pricing" className="text-2xl">
                Pricing
              </h2>
              <ul className="mt-4 space-y-2">
                {p.rateRules.map((r) => (
                  <li key={r.id} className="text-ink-soft">
                    <span className="font-semibold text-ink">{formatINR(r.amountPaise)}</span>{" "}
                    {r.basis === "PER_PACKAGE" && r.includedTravellers ? `for ${r.includedTravellers} travellers` : BASIS_LABELS[r.basis]}
                    <span className="text-muted"> — {r.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">This is the published indicative price. It is not a confirmed quotation; availability and the final price are confirmed when we reply.</p>
            </section>
          )}

          {p.images.length > 0 && (
            <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {p.images.map((image) => (
                <li key={image.mediaId}>
                  <Photo asset={image.media} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" showCredit className="aspect-[4/3] rounded-sm" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="lg:col-span-5 lg:col-start-8 xl:col-span-4 xl:col-start-9">
          <div id="enquire" className="scroll-mt-24 rounded-sm border border-line bg-surface p-6 sm:p-7">
            <h2 className="text-2xl">Enquire about this package</h2>
            <p className="mt-2 mb-6 text-sm text-muted">Tell us your dates and group; we reply with availability and a quote.</p>
            <PackageEnquiryForm
              packageId={p.id}
              packageTitle={p.title}
              addons={p.addons.map((a) => ({ id: a.id, name: a.name, description: a.description, basis: a.basis, amountPaise: a.amountPaise }))}
            />
          </div>
        </aside>
      </div>

      {p.related.length > 0 && (
        <section aria-labelledby="related" className="border-t border-line bg-paper-deep/60 py-16">
          <div className="container-page">
            <h2 id="related" className="text-[2rem]">
              Related packages
            </h2>
            <div className="mt-8 space-y-8">
              {p.related.map((r) => (
                <PackageCard
                  key={r.id}
                  slug={r.slug}
                  title={r.title}
                  category={r.category}
                  summary={r.summary}
                  durationDays={r.durationDays}
                  durationNights={r.durationNights}
                  idealFor={r.idealFor}
                  route={r.destinations.map((d) => d.destination.name)}
                  image={r.heroImage}
                  priceLabel={r.priceLabel}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
