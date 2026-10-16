import type { MetadataRoute } from "next";

// Rendered at request time so the sitemap URL uses the runtime APP_URL, not the build machine's.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/track"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
