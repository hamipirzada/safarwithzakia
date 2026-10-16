import { SiteFooter, SiteHeader, WhatsAppButton } from "@/components/site/SiteChrome";

// Public pages read live content (packages, rates, settings) from the database.
export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
      <WhatsAppButton />
    </>
  );
}
