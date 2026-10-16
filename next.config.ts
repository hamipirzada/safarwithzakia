import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Next.js inlines small bootstrap scripts, so script-src needs 'unsafe-inline' unless nonces are
// adopted (which forces fully dynamic rendering). Everything else is locked to this origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

// Destination ids used by the previous PHP site (trip-builder.php?location=N).
const LEGACY_LOCATIONS: Record<string, string> = { "1": "srinagar-dal-lake", "2": "gulmarg", "3": "pahalgam", "5": "sonmarg" };

const nextConfig: NextConfig = {
  // Cache Components is deliberately off: pages read live database content and render per
  // request. See docs/TECHNICAL_DECISIONS.md (TD-04).
  output: "standalone",
  // End-to-end tests build into a separate directory so they never disturb a running server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Dev-only badge: every corner overlaps a real control (admin rail, mobile menu, WhatsApp, toasts).
  devIndicators: false,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 828, 1080, 1440, 1920],
    imageSizes: [96, 160, 256, 384],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
  async redirects() {
    return [
      ...Object.entries(LEGACY_LOCATIONS).map(([id, slug]) => ({
        source: "/trip-builder.php",
        has: [{ type: "query" as const, key: "location", value: id }],
        destination: `/trip-builder?destination=${slug}`,
        permanent: true,
      })),
      {
        source: "/package-details.php",
        has: [{ type: "query" as const, key: "id", value: "1" }],
        destination: "/packages/kashmir-honeymoon-delight",
        permanent: true,
      },
      { source: "/trip-builder.php", destination: "/trip-builder", permanent: true },
      { source: "/package-details.php", destination: "/packages", permanent: true },
      { source: "/index.php", destination: "/", permanent: true },
      { source: "/about.php", destination: "/about", permanent: true },
      { source: "/contact.php", destination: "/contact", permanent: true },
      { source: "/packages.php", destination: "/packages", permanent: true },
      { source: "/track.php", destination: "/track", permanent: true },
    ];
  },
};

export default nextConfig;
