import type { Metadata } from "next";
import { PageIntro } from "@/components/site/Cards";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Photo credits", description: "Authors and licences of the photographs used on this website.", alternates: { canonical: "/credits" } };

export default async function CreditsPage() {
  const media = await prisma.mediaAsset.findMany({ orderBy: { path: "asc" } });
  return (
    <>
      <PageIntro title="Photo credits" intro="We are grateful to the photographers whose work appears on this website under Creative Commons licences." />
      <section className="container-page py-14">
        <ul className="max-w-3xl divide-y divide-line border-y border-line">
          {media.map((m) => (
            <li key={m.id} className="py-4 text-sm">
              <p className="text-ink">{m.alt}</p>
              <p className="mt-1 text-muted">
                {m.credit ?? "Photographer not recorded"}
                {m.license && (
                  <>
                    {" · "}
                    {m.licenseUrl ? (
                      <a href={m.licenseUrl} className="link" rel="license noopener noreferrer" target="_blank">{m.license}</a>
                    ) : (
                      m.license
                    )}
                  </>
                )}
                {m.sourceUrl && (
                  <>
                    {" · "}
                    <a href={m.sourceUrl} className="link" rel="noopener noreferrer" target="_blank">Source</a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-3xl text-sm text-muted">Images were resized for the web. Files under share-alike (BY-SA) licences remain available under the same licence.</p>
      </section>
    </>
  );
}
