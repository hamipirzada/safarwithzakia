/**
 * Legal and policy pages. The text describes what this software actually does with data.
 * It has NOT been reviewed by a lawyer or confirmed by the business. Until `reviewed` is set
 * to true (after that review), each page shows a visible notice saying so.
 * See docs/ASSUMPTIONS.md (A-10) and docs/SECURITY.md.
 */

export const LEGAL_LAST_UPDATED = "16 October 2026";

export interface LegalPage {
  slug: "privacy" | "terms" | "booking-conditions";
  title: string;
  description: string;
  reviewed: boolean;
  body: React.ReactNode;
}

export const LEGAL_PAGES: Record<LegalPage["slug"], LegalPage> = {
  privacy: {
    slug: "privacy",
    title: "Privacy notice",
    description: "How Safar With Zakia collects, uses and stores the information you send through this website.",
    reviewed: false,
    body: (
      <>
        <h2>What we collect</h2>
        <p>When you send a contact message, a package enquiry or a custom trip request, we collect the details you type into the form:</p>
        <ul>
          <li>your name, email address and phone or WhatsApp number;</li>
          <li>trip details such as destinations, dates, number of travellers, preferences, budget and any message;</li>
          <li>a keyed, one-way hash of your IP address, used only to prevent abuse and spam. We do not store your raw IP address with your enquiry.</li>
        </ul>
        <p>This website does not take payments and does not ask for card or bank details.</p>

        <h2>Why we use it</h2>
        <ul>
          <li>to reply to your enquiry and prepare a trip plan and quote;</li>
          <li>to send you an email confirming that we received your enquiry;</li>
          <li>to keep a record of what you asked for, so we can refer back to it when we speak to you.</li>
        </ul>
        <p>We do not sell your information or use it for advertising.</p>

        <h2>Who processes it</h2>
        <p>
          Enquiries are stored in our database and are visible only to our staff through a password-protected admin area. Notification and
          confirmation emails are sent through Google&apos;s Gmail service from our business mailbox. Our hosting and database providers store the
          data on our behalf.
        </p>

        <h2>How long we keep it</h2>
        <p>
          We keep enquiries for as long as we need them to deal with your trip and for our records, and then delete them. You can ask us to delete
          your enquiry sooner.
        </p>

        <h2>Your choices</h2>
        <p>
          You can ask to see, correct or delete the information we hold about you by contacting us using the details on the{" "}
          <a href="/contact">contact page</a>.
        </p>

        <h2>Cookies</h2>
        <p>
          The public website does not use advertising or analytics cookies. The trip builder may keep an unsent draft in your browser&apos;s session
          storage so you do not lose your work; it is removed when you send the trip or close the browser tab. Staff who sign in to the admin area
          receive a secure session cookie.
        </p>
      </>
    ),
  },
  terms: {
    slug: "terms",
    title: "Terms of use",
    description: "Terms for using the Safar With Zakia website.",
    reviewed: false,
    body: (
      <>
        <h2>Using this website</h2>
        <p>
          This website provides information about travel in Kashmir and lets you send enquiries to Safar With Zakia. Please give accurate
          details so that we can reply to you.
        </p>
        <h2>Information and prices</h2>
        <p>
          We try to keep destination information and published rates up to date, but they can change. Any estimate shown on this website is
          indicative only. A price is confirmed only in a written quote from our team.
        </p>
        <h2>Enquiries are not bookings</h2>
        <p>
          Sending an enquiry does not create a booking or a contract. See the <a href="/booking-conditions">enquiry and booking conditions</a>.
        </p>
        <h2>Photographs</h2>
        <p>
          Some photographs on this website are used under Creative Commons licences; their authors and licences are listed on the{" "}
          <a href="/credits">photo credits</a> page.
        </p>
        <h2>Acceptable use</h2>
        <p>Please do not misuse the forms, send automated requests or attempt to access parts of the website that are not public.</p>
      </>
    ),
  },
  "booking-conditions": {
    slug: "booking-conditions",
    title: "Enquiry & booking conditions",
    description: "What happens after you send an enquiry, and what an estimate means.",
    reviewed: false,
    body: (
      <>
        <h2>Enquiries</h2>
        <p>
          When you send an enquiry you receive a reference number. This confirms that we have received and saved your request. It does not
          reserve accommodation, transport or any other service.
        </p>
        <h2>Estimates and quotes</h2>
        <p>
          Where rates are published, the trip builder shows an indicative estimate calculated from those rates, using the basis shown (for
          example per person, per day). When a rate depends on details we do not have, the website shows &ldquo;Request a quote&rdquo; instead.
          Your confirmed price, what it includes, and any payment and cancellation terms are set out in the quote we send you.
        </p>
        <h2>Promo codes</h2>
        <p>Promo codes are applied to estimates where they are valid. Whether a code applies to your final quote is confirmed by our team.</p>
        <h2>Payments</h2>
        <p>This website does not take payments. Never send card details by email or through the enquiry forms.</p>
      </>
    ),
  },
};
