import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/site/Cards";
import { TripBuilder } from "@/components/forms/TripBuilder";
import { listTripBuilderDestinations } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Build your own Kashmir trip",
  description: "Choose destinations, days, dates and travellers, see published rates where available, and send your trip for a personal quote.",
  alternates: { canonical: "/trip-builder" },
};

export default async function TripBuilderPage({ searchParams }: PageProps<"/trip-builder">) {
  const { destination } = await searchParams;
  const destinations = await listTripBuilderDestinations();
  const preselected = typeof destination === "string" ? (destinations.find((d) => d.slug === destination)?.id ?? null) : null;

  return (
    <>
      <PageIntro
        eyebrow="Custom trip builder"
        title="Build your dream trip"
        intro="Choose where to go and for how long. Where published rates exist you will see an indicative estimate; otherwise we will price your trip personally."
      />
      <section className="container-page py-12 sm:py-16">
        {destinations.length === 0 ? (
          <p className="text-muted">
            The trip builder is being updated. Please <Link href="/contact" className="link">contact us</Link> with your plans.
          </p>
        ) : (
          <TripBuilder
            destinations={destinations.map((d) => ({ id: d.id, slug: d.slug, name: d.name, summary: d.summary, recommendedDuration: d.recommendedDuration, priceLabel: d.priceLabel }))}
            preselectedId={preselected}
          />
        )}
      </section>
    </>
  );
}
