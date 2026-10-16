import "server-only";
import { prisma } from "./db";

export async function listMediaOptions() {
  return prisma.mediaAsset.findMany({ orderBy: { path: "asc" }, select: { id: true, path: true, alt: true } });
}
