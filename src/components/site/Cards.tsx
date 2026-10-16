import Link from "next/link";
import { ArrowRight, Clock, Users } from "lucide-react";
import { Photo, type PhotoAsset } from "./Photo";

export function DestinationCard({
  slug,
  name,
  summary,
  image,
  priceLabel,
  size = "default",
}: {
  slug: string;
  name: string;
  summary: string;
  image: PhotoAsset | null;
  priceLabel: string | null;
  size?: "default" | "feature";
}) {
  const feature = size === "feature";
  return (
    <article className="group relative flex h-full flex-col">
      <Photo
        asset={image}
        sizes={feature ? "(min-width: 1024px) 58vw, 100vw" : "(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"}
        className={`rounded-sm ${feature ? "aspect-[4/3] lg:aspect-[16/10]" : "aspect-[4/3]"}`}
        fallbackLabel={name}
      />
      <div className="mt-4 flex flex-1 flex-col">
        <h3 className={`text-ink ${feature ? "text-[1.75rem] leading-tight" : "text-[1.375rem] leading-snug"}`}>
          <Link href={`/destinations/${slug}`} className="after:absolute after:inset-0 hover:underline hover:decoration-saffron">
            {name}
          </Link>
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{summary}</p>
        <p className="mt-auto pt-3 text-sm font-medium text-ink-soft">{priceLabel ?? "Rates on request"}</p>
      </div>
    </article>
  );
}

export function PackageCard({
  slug,
  title,
  category,
  summary,
  durationDays,
  durationNights,
  idealFor,
  route,
  image,
  priceLabel,
}: {
  slug: string;
  title: string;
  category: string | null;
  summary: string;
  durationDays: number;
  durationNights: number;
  idealFor: string | null;
  route: string[];
  image: PhotoAsset | null;
  priceLabel: string | null;
}) {
  return (
    <article className="group relative grid grid-cols-1 overflow-hidden rounded-sm border border-line bg-surface md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <Photo asset={image} sizes="(min-width: 768px) 40vw, 100vw" className="aspect-[4/3] md:aspect-auto md:min-h-72" fallbackLabel={title} />
      <div className="flex flex-col p-6 sm:p-8">
        {category && <p className="eyebrow">{category}</p>}
        <h3 className="mt-2 text-[1.625rem] leading-tight text-ink">
          <Link href={`/packages/${slug}`} className="after:absolute after:inset-0 hover:underline hover:decoration-saffron">
            {title}
          </Link>
        </h3>
        <p className="mt-3 leading-relaxed text-muted">{summary}</p>
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
          <div className="flex items-center gap-2">
            <Clock aria-hidden size={15} className="text-saffron-ink" />
            <dt className="sr-only">Duration</dt>
            <dd>
              {durationDays} days / {durationNights} nights
            </dd>
          </div>
          {idealFor && (
            <div className="flex items-center gap-2">
              <Users aria-hidden size={15} className="text-saffron-ink" />
              <dt className="sr-only">Suited to</dt>
              <dd>{idealFor}</dd>
            </div>
          )}
        </dl>
        {route.length > 0 && <p className="mt-3 text-sm text-muted">{route.join(" · ")}</p>}
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          <p className="text-sm">
            <span className="block text-ink">{priceLabel ?? "Price on request"}</span>
            {priceLabel && <span className="text-xs text-muted">Indicative — confirmed in your quote</span>}
          </p>
          <span aria-hidden className="inline-flex items-center gap-1 text-sm font-semibold text-ink group-hover:text-saffron-ink">
            View <ArrowRight size={16} />
          </span>
        </div>
      </div>
    </article>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={id} className="mt-3 text-[2rem] leading-[1.1] text-ink sm:text-[2.5rem]">
          {title}
        </h2>
        {intro && <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted">{intro}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageIntro({ eyebrow, title, intro, children }: { eyebrow?: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section className="border-b border-line bg-paper">
      <div className="container-page py-14 sm:py-20">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-3 max-w-3xl text-[2.375rem] leading-[1.05] text-ink sm:text-[3.25rem]">{title}</h1>
        {intro && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{intro}</p>}
        {children}
      </div>
    </section>
  );
}
