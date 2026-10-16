import type { Metadata } from "next";
import Link from "next/link";
import { manifestImage } from "@/content/images";
import { Photo } from "@/components/site/Photo";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = {
  title: "About us",
  description: "Safar With Zakia is a Kashmir travel agency founded by Zakia, a local traveller who plans personal, flexible trips rooted in local knowledge.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const about = await getSetting("about");
  const image = manifestImage("dal-lake-houseboats");

  return (
    <>
      <section className="border-b border-line">
        <div className="container-page grid grid-cols-1 gap-10 py-14 sm:py-20 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <p className="eyebrow">About us</p>
            <h1 className="mt-3 text-[2.375rem] leading-[1.05] sm:text-[3.25rem]">{about.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">{about.lead}</p>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <Photo asset={image} sizes="(min-width: 1024px) 40vw, 100vw" priority showCredit className="aspect-[4/3] rounded-sm" />
          </div>
        </div>
      </section>

      <section aria-labelledby="story" className="container-page grid grid-cols-1 gap-10 py-16 lg:grid-cols-12 lg:py-20">
        <h2 id="story" className="text-[2rem] lg:col-span-4">
          Our story
        </h2>
        <div className="prose-safar lg:col-span-7 lg:col-start-6">
          {about.story.map((paragraph) => (
            <p key={paragraph.slice(0, 32)}>{paragraph}</p>
          ))}
        </div>
      </section>

      {(about.mission || about.vision || about.values.length > 0) && (
        <section aria-label="Mission and values" className="border-y border-line bg-surface">
          <div className="container-page grid grid-cols-1 gap-10 py-16 md:grid-cols-3">
            {about.mission && (
              <div>
                <span className="rule-accent" />
                <h2 className="mt-5 text-xl">Our mission</h2>
                <p className="mt-3 leading-relaxed text-muted">{about.mission}</p>
              </div>
            )}
            {about.vision && (
              <div>
                <span className="rule-accent" />
                <h2 className="mt-5 text-xl">Our vision</h2>
                <p className="mt-3 leading-relaxed text-muted">{about.vision}</p>
              </div>
            )}
            {about.values.length > 0 && (
              <div>
                <span className="rule-accent" />
                <h2 className="mt-5 text-xl">How we work</h2>
                <ul className="mt-3 space-y-2 text-muted">
                  {about.values.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {about.team.length > 0 && (
        <section aria-labelledby="team" className="container-page py-16 lg:py-20">
          <h2 id="team" className="text-[2rem]">
            The team
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {about.team.map((member) => (
              <li key={member.name} className="flex items-center gap-4 border-t border-line pt-5">
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-paper-deep font-display text-lg text-ink">
                  {member.name.charAt(0)}
                </span>
                <span>
                  <span className="block font-semibold text-ink">{member.name}</span>
                  <span className="text-sm text-muted">{member.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {about.quote && (
        <section className="bg-night text-paper">
          <figure className="container-page py-16 lg:py-24">
            <blockquote className="max-w-3xl font-display text-[1.75rem] leading-snug font-light sm:text-[2.25rem]">“{about.quote}”</blockquote>
            {about.quoteAttribution && <figcaption className="mt-6 text-sm tracking-[0.14em] text-saffron uppercase">{about.quoteAttribution}</figcaption>}
            <Link href="/trip-builder" className="btn btn-on-dark mt-10">
              Plan a trip with us
            </Link>
          </figure>
        </section>
      )}
    </>
  );
}
