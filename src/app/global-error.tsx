"use client";

// Last-resort boundary when the root layout itself fails. Keep it dependency-free.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", color: "#16212c", background: "#f6f2ea" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Something went wrong</h1>
        <p>Please try again in a moment.</p>
        <button type="button" onClick={reset} style={{ marginTop: "1rem", padding: "0.6rem 1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
