import type { Metadata } from "next";
import { DestinationCard, PageIntro } from "@/components/site/Cards";
import { listDestinations } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Destinations in Kashmir",
  description: "Srinagar and Dal Lake, Gulmarg, Pahalgam and Sonmarg — the places we plan trips around.",
  alternates: { canonical: "/destinations" },
};

export default async function DestinationsPage() {
  const destinations = await listDestinations();
  return (
    <>
      <PageIntro eyebrow="Where to go" title="Destinations" intro="Lakes, meadows, river valleys and glaciers. Combine any of them in the trip builder." />
      <section className="container-page py-14 sm:py-20">
        {destinations.length === 0 ? (
          <p className="text-muted">Destinations will appear here soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((d) => (
              <DestinationCard key={d.id} slug={d.slug} name={d.name} summary={d.summary} image={d.heroImage} priceLabel={d.priceLabel} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
