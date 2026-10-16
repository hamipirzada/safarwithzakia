/** Text wordmark. The business has no published logo file; this is a typographic stand-in. */
export function Wordmark({ name, tone = "ink" }: { name: string; tone?: "ink" | "light" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${tone === "light" ? "text-paper" : "text-ink"}`}>
      <svg aria-hidden="true" width="26" height="18" viewBox="0 0 26 18" fill="none" className="shrink-0">
        <path d="M1 17 8.5 5l4 6 3.5-4.5L25 17" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8.5 5 10.6 8.3" stroke="var(--color-saffron)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[1.2rem] leading-none tracking-tight">{name}</span>
    </span>
  );
}
