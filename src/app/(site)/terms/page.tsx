import type { Metadata } from "next";
import { LEGAL_PAGES } from "@/content/legal";
import { LegalArticle } from "@/components/site/LegalArticle";

const page = LEGAL_PAGES["terms"];

export const metadata: Metadata = { title: page.title, description: page.description, alternates: { canonical: "/terms" } };

export default function Page() {
  return <LegalArticle page={page} />;
}
