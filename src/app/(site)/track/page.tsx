import type { Metadata } from "next";
import { PageIntro } from "@/components/site/Cards";
import { TrackForm } from "@/components/forms/TrackForm";

export const metadata: Metadata = {
  title: "Check an enquiry",
  description: "Check the status of an enquiry with your reference number and email address.",
  alternates: { canonical: "/track" },
  robots: { index: false },
};

export default function TrackPage() {
  return (
    <>
      <PageIntro eyebrow="Your enquiry" title="Check an enquiry" intro="Enter the reference number you received and the email address you used." />
      <section className="container-page py-14 sm:py-20">
        <div className="max-w-xl">
          <TrackForm />
        </div>
      </section>
    </>
  );
}
