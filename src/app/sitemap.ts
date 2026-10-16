import type { MetadataRoute } from "next";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const [destinations, packages] = await Promise.all([
    prisma.destination.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.package.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
  ]);
  const staticPaths = ["/", "/destinations", "/packages", "/trip-builder", "/about", "/contact", "/privacy", "/terms", "/booking-conditions", "/credits"];
  return [
    ...staticPaths.map((path) => ({ url: `${base}${path}`, changeFrequency: "monthly" as const, priority: path === "/" ? 1 : 0.6 })),
    ...destinations.map((d) => ({ url: `${base}/destinations/${d.slug}`, lastModified: d.updatedAt, priority: 0.8 })),
    ...packages.map((p) => ({ url: `${base}/packages/${p.slug}`, lastModified: p.updatedAt, priority: 0.8 })),
  ];
}
