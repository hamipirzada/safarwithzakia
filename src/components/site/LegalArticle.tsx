import { LEGAL_LAST_UPDATED, type LegalPage } from "@/content/legal";
import { PageIntro } from "./Cards";

export function LegalArticle({ page }: { page: LegalPage }) {
  return (
    <>
      <PageIntro title={page.title} intro={page.description} />
      <div className="container-page py-14">
        {!page.reviewed && (
          <p role="note" className="mb-8 max-w-3xl rounded-sm border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink">
            This page describes how this website works. It is awaiting review by Safar With Zakia and may change.
          </p>
        )}
        <div className="prose-safar max-w-3xl">{page.body}</div>
        <p className="mt-12 text-sm text-muted">Last updated {LEGAL_LAST_UPDATED}</p>
      </div>
    </>
  );
}
