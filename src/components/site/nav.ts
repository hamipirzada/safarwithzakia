export const NAV_ITEMS = [
  { href: "/destinations", label: "Destinations" },
  { href: "/packages", label: "Packages" },
  { href: "/trip-builder", label: "Plan a trip" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function whatsappHref(e164: string, message: string): string | null {
  if (!e164) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${e164.replace(/^\+/, "")}${text}`;
}
