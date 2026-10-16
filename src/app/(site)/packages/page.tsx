import type { Metadata } from "next";
import Link from "next/link";
import { PackageCard, PageIntro } from "@/components/site/Cards";
import { listPackages } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Kashmir tour packages",
  description: "Ready-made Kashmir routes you can take as they are or adjust, with published starting prices.",
  alternates: { canonical: "/packages" },
};

export default async function PackagesPage() {
  const packages = await listPackages();
  return (
    <>
      <PageIntro eyebrow="Ready-made routes" title="Travel packages" intro="Start from one of these routes and we will adapt it to your dates, group and pace." />
      <section className="container-page py-14 sm:py-20">
        {packages.length === 0 ? (
          <p className="text-muted">No packages are published right now.</p>
        ) : (
          <div className="space-y-8">
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
                route={p.destinations.filter((d) => d.destination.status === "PUBLISHED").map((d) => d.destination.name)}
                image={p.heroImage}
                priceLabel={p.priceLabel}
              />
            ))}
          </div>
        )}
        <div className="mt-16 rounded-sm border border-line bg-surface p-8 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <h2 className="text-2xl">Nothing quite right?</h2>
            <p className="mt-2 text-muted">Build your own route with the destinations and days you want.</p>
          </div>
          <Link href="/trip-builder" className="btn btn-primary mt-5 sm:mt-0">
            Open the trip builder
          </Link>
        </div>
      </section>
    </>
  );
}
