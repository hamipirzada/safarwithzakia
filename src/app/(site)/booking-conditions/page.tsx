import type { Metadata } from "next";
import { LEGAL_PAGES } from "@/content/legal";
import { LegalArticle } from "@/components/site/LegalArticle";

const page = LEGAL_PAGES["booking-conditions"];

export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: "/booking-conditions" } };

export default function Page() {
  return <LegalArticle page={page} />;
}
