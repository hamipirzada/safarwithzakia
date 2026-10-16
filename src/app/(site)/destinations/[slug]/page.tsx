import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { formatINR } from "@/domain/money";
import { BASIS_LABELS } from "@/domain/pricing";
import { PackageCard } from "@/components/site/Cards";
import { Photo } from "@/components/site/Photo";
import { getDestination } from "@/server/catalog";

export async function generateMetadata({ params }: PageProps<"/destinations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const d = await getDestination(slug);
  if (!d) return { title: "Destination not found" };
  return {
    title: d.seoTitle ?? `${d.name} — Kashmir`,
    description: d.seoDescription ?? d.summary,
    alternates: { canonical: `/destinations/${d.slug}` },
    openGraph: d.heroImage ? { images: [{ url: d.heroImage.path, width: d.heroImage.width, height: d.heroImage.height, alt: d.heroImage.alt }] } : undefined,
  };
}

export default async function DestinationPage({ params }: PageProps<"/destinations/[slug]">) {
  const { slug } = await params;
  const d = await getDestination(slug);
  if (!d) notFound();

  const facts = [
    ["Region", d.region],
    ["Best time to visit", d.bestSeason],
    ["Suggested stay", d.recommendedDuration],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <article>
      <header className="relative bg-night text-paper">
        <Photo asset={d.heroImage} sizes="100vw" priority showCredit className="absolute inset-0" fallbackLabel={d.name} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-night/10" />
        <div className="container-page relative flex min-h-[26rem] flex-col justify-end pt-24 pb-12 sm:min-h-[32rem]">
          <nav aria-label="Breadcrumb" className="text-sm text-paper/70">
            <Link href="/destinations" className="hover:text-paper">
              Destinations
            </Link>{" "}
            / <span aria-current="page">{d.name}</span>
          </nav>
          <h1 className="mt-3 text-[2.75rem] leading-[1.02] font-light sm:text-[4rem]">{d.name}</h1>
          <p className="mt-4 max-w-2xl text-lg text-paper/85">{d.summary}</p>
        </div>
      </header>

      <div className="container-page grid grid-cols-1 gap-12 py-14 lg:grid-cols-12 lg:py-20">
        <div className="lg:col-span-7">
          <div className="prose-safar">
            {d.description.split(/\n{2,}/).map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </div>

          {d.attractions.length > 0 && (
            <section aria-labelledby="highlights" className="mt-12">
              <h2 id="highlights" className="text-2xl">
                Highlights
              </h2>
              <ul className="mt-5 divide-y divide-line border-y border-line">
                {d.attractions.map((a) => (
                  <li key={a.id} className="py-4">
                    <p className="font-semibold text-ink">{a.name}</p>
                    {a.description && <p className="mt-1 text-muted">{a.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {d.travelTips && (
            <section aria-labelledby="tips" className="mt-12">
              <h2 id="tips" className="text-2xl">
                Travel notes
              </h2>
              <p className="prose-safar mt-4 whitespace-pre-line">{d.travelTips}</p>
            </section>
          )}
        </div>

        <aside className="lg:col-span-4 lg:col-start-9">
          <div className="rounded-sm border border-line bg-surface p-6 lg:sticky lg:top-28">
            {facts.length > 0 && (
              <dl className="space-y-3 text-sm">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className={facts.length ? "mt-5 border-t border-line pt-5" : ""}>
              {d.rateRules.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {d.rateRules.map((r) => (
                    <li key={r.id}>
                      <span className="font-semibold text-ink">{formatINR(r.amountPaise)}</span> <span className="text-muted">{BASIS_LABELS[r.basis]}</span>
                      <span className="block text-xs text-muted">
                        {r.label}
                        {r.seasonStart && ` · ${r.seasonStart} to ${r.seasonEnd}`}
                      </span>
                    </li>
                  ))}
                  <li className="pt-1 text-xs text-muted">Published rates; your quote confirms the final price.</li>
                </ul>
              ) : (
                <p className="text-sm text-muted">Rates for {d.name} are quoted on request.</p>
              )}
            </div>
            <Link href={`/trip-builder?destination=${d.slug}`} className="btn btn-primary mt-6 w-full">
              Plan a trip with {d.name.split(" – ")[0]} <ArrowRight aria-hidden size={17} />
            </Link>
          </div>
        </aside>
      </div>

      {d.images.length > 0 && (
        <section aria-label="Gallery" className="container-page pb-16">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.images.map((image) => (
              <li key={image.mediaId}>
                <Photo asset={image.media} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" showCredit className="aspect-[4/3] rounded-sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.relatedPackages.length > 0 && (
        <section aria-labelledby="related" className="border-t border-line bg-paper-deep/60 py-16">
          <div className="container-page">
            <h2 id="related" className="text-[2rem]">
              Packages that include {d.name.split(" – ")[0]}
            </h2>
            <div className="mt-8 space-y-8">
              {d.relatedPackages.map((p) => (
                <PackageCard
                  key={p.id}
                  slug={p.slug}
                  title={p.title}
                  category={p.category}
                  summary={p.summary}
                  durationDays={p.durationDays}
                  durationNights={p.durationNights}
                  idealFor={p.idealFor}
                  route={[]}
                  image={p.heroImage}
                  priceLabel={p.priceLabel}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
