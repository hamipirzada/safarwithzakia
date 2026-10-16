import Image from "next/image";

/**
 * The business logo (round badge, from the official Instagram profile) beside the name in text.
 * The badge's own lettering is too small to read at header size, so the name stays as text.
 * The source file is 100×100 px: keep the badge at 48px or smaller so it stays sharp on 2× screens.
 */
export const LOGO_SRC = "/images/brand/safar-with-zakia-logo.jpg";

export function Wordmark({ name, tone = "ink", size = 40 }: { name: string; tone?: "ink" | "light"; size?: 32 | 40 | 48 }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${tone === "light" ? "text-paper" : "text-ink"}`}>
      <Image
        src={LOGO_SRC}
        alt=""
        width={size}
        height={size}
        unoptimized // 100px original: serve as-is rather than re-encode
        className="shrink-0 rounded-full bg-white ring-1 ring-black/5"
        data-logo
      />
      <span className="font-display text-[1.2rem] leading-none tracking-tight">{name}</span>
    </span>
  );
}
