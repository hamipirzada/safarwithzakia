"use client";

import Link from "next/link";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-24">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-3 text-[2.25rem] leading-tight">We couldn’t load this page</h1>
      <p className="mt-4 max-w-xl text-muted">Please try again. If you were sending an enquiry and are unsure whether it went through, contact us by phone or WhatsApp.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
        <Link href="/contact" className="btn btn-secondary">Contact us</Link>
      </div>
    </div>
  );
}
