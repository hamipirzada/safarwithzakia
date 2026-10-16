import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PageIntro } from "@/components/site/Cards";
import { whatsappHref } from "@/components/site/nav";
import { ContactForm } from "@/components/forms/ContactForm";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Questions or plans for a Kashmir trip? Send us a message, call or WhatsApp.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const business = await getSetting("business");
  const whatsapp = whatsappHref(business.whatsappE164, business.whatsappMessage);

  return (
    <>
      <PageIntro eyebrow="Contact" title="Get in touch" intro="We are here to answer your questions and plan your trip. We reply to every message personally." />
      <section className="container-page grid grid-cols-1 gap-12 py-14 sm:py-20 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 className="text-2xl">Send us a message</h2>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>
        <aside className="lg:col-span-4 lg:col-start-9">
          <h2 className="text-2xl">Other ways to reach us</h2>
          <ul className="mt-6 space-y-5">
            {business.phoneE164 && (
              <li className="flex gap-3">
                <Phone aria-hidden size={18} className="mt-1 text-saffron-ink" />
                <div>
                  <p className="text-sm text-muted">Phone</p>
                  <a href={`tel:${business.phoneE164}`} className="text-ink hover:underline">
                    {business.phone}
                  </a>
                </div>
              </li>
            )}
            {whatsapp && (
              <li className="flex gap-3">
                <MessageCircle aria-hidden size={18} className="mt-1 text-saffron-ink" />
                <div>
                  <p className="text-sm text-muted">WhatsApp</p>
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
                    Start a chat
                  </a>
                </div>
              </li>
            )}
            {business.email && (
              <li className="flex gap-3">
                <Mail aria-hidden size={18} className="mt-1 text-saffron-ink" />
                <div>
                  <p className="text-sm text-muted">Email</p>
                  <a href={`mailto:${business.email}`} className="break-all text-ink hover:underline">
                    {business.email}
                  </a>
                </div>
              </li>
            )}
            {business.offices.map((office) => (
              <li key={office.label} className="flex gap-3">
                <MapPin aria-hidden size={18} className="mt-1 text-saffron-ink" />
                <div>
                  <p className="text-sm text-muted">{office.label}</p>
                  <p className="text-ink">{office.address}</p>
                </div>
              </li>
            ))}
          </ul>
          {business.mapUrl && (
            <a href={business.mapUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-6">
              Open in Google Maps
            </a>
          )}
        </aside>
      </section>
    </>
  );
}
