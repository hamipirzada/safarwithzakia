import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page py-24 sm:py-32">
        <p className="eyebrow">Page not found</p>
        <h1 className="mt-3 max-w-2xl text-[2.5rem] leading-tight sm:text-[3.25rem]">This path doesn’t lead anywhere</h1>
        <p className="mt-5 max-w-xl text-lg text-muted">The page may have moved, or the link may be mistyped. These are good places to pick up the trail:</p>
        <ul className="mt-8 flex flex-wrap gap-3">
          <li><Link href="/" className="btn btn-primary">Home</Link></li>
          <li><Link href="/destinations" className="btn btn-secondary">Destinations</Link></li>
          <li><Link href="/packages" className="btn btn-secondary">Packages</Link></li>
          <li><Link href="/trip-builder" className="btn btn-secondary">Plan a trip</Link></li>
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
