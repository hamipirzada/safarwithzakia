import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { getSetting } from "@/server/settings";
import { HeaderBar } from "./HeaderBar";
import { NAV_ITEMS, whatsappHref } from "./nav";
import { Wordmark } from "./Wordmark";

export async function SiteHeader() {
  const [business, announcement] = await Promise.all([getSetting("business"), getSetting("announcement")]);
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <HeaderBar
        businessName={business.name}
        announcement={announcement.enabled && announcement.message ? announcement : null}
      />
    </>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  if (!href) return null;
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-paper">
        {label}
      </a>
    </li>
  );
}

export async function SiteFooter() {
  const business = await getSetting("business");
  const whatsapp = whatsappHref(business.whatsappE164, business.whatsappMessage);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-night text-paper/75">
      <div className="container-page grid grid-cols-1 gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <Wordmark name={business.name} tone="light" />
          <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed">{business.tagline}</p>
          {business.offices.length > 0 && (
            <ul className="mt-6 space-y-3 text-sm">
              {business.offices.map((office) => (
                <li key={office.label} className="flex gap-3">
                  <MapPin aria-hidden size={16} className="mt-0.5 shrink-0 text-saffron" />
                  <span>
                    <span className="block text-paper">{office.label}</span>
                    {office.address}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav aria-label="Footer" className="md:col-span-3">
          <h2 className="font-sans text-xs font-semibold tracking-[0.14em] text-paper uppercase">Explore</h2>
          <ul className="mt-4 space-y-2.5 text-[0.9375rem]">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-paper">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/track" className="hover:text-paper">
                Check an enquiry
              </Link>
            </li>
          </ul>
        </nav>

        <div className="md:col-span-4">
          <h2 className="font-sans text-xs font-semibold tracking-[0.14em] text-paper uppercase">Get in touch</h2>
          <ul className="mt-4 space-y-3 text-[0.9375rem]">
            {business.phoneE164 && (
              <li>
                <a href={`tel:${business.phoneE164}`} className="inline-flex items-center gap-3 hover:text-paper">
                  <Phone aria-hidden size={16} className="text-saffron" /> {business.phone}
                </a>
              </li>
            )}
            {whatsapp && (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 hover:text-paper">
                  <MessageCircle aria-hidden size={16} className="text-saffron" /> WhatsApp
                </a>
              </li>
            )}
            {business.email && (
              <li>
                <a href={`mailto:${business.email}`} className="inline-flex items-center gap-3 break-all hover:text-paper">
                  <Mail aria-hidden size={16} className="shrink-0 text-saffron" /> {business.email}
                </a>
              </li>
            )}
          </ul>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <SocialLink href={business.instagramUrl} label="Instagram" />
            <SocialLink href={business.facebookUrl} label="Facebook" />
            <SocialLink href={business.youtubeUrl} label="YouTube" />
            {business.mapUrl && <SocialLink href={business.mapUrl} label="Open in Maps" />}
          </ul>
        </div>
      </div>

      <div className="border-t border-paper/10">
        <div className="container-page flex flex-col gap-3 pt-6 pb-24 text-[0.8125rem] sm:flex-row sm:items-center sm:justify-between sm:pb-6">
          <p>
            © {year} {business.name}
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            <li><Link href="/privacy" className="hover:text-paper">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-paper">Terms</Link></li>
            <li><Link href="/booking-conditions" className="hover:text-paper">Enquiry & booking conditions</Link></li>
            <li><Link href="/credits" className="hover:text-paper">Photo credits</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export async function WhatsAppButton() {
  const business = await getSetting("business");
  const href = whatsappHref(business.whatsappE164, business.whatsappMessage);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed right-4 bottom-4 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-[#1f7a4d] pr-4 pl-3.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-[#186540] sm:right-6 sm:bottom-6"
    >
      <MessageCircle aria-hidden size={20} />
      <span>
        <span className="sr-only sm:not-sr-only">Chat on </span>WhatsApp
      </span>
    </a>
  );
}
