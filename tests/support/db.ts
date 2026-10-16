import { prisma } from "@/server/db";

/** Remove all rows (fast; keeps the schema). Only ever used against the test database. */
export async function resetDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("test")) throw new Error("resetDatabase refused: not a test database");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function createDestination(name: string, options: { rate?: { basis: "PER_PERSON_PER_DAY" | "PER_GROUP_PER_DAY"; amountPaise: number; childAmountPaise?: number | null; active?: boolean; seasonStart?: string; seasonEnd?: string } } = {}) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return prisma.destination.create({
    data: {
      name,
      slug,
      summary: `${name} summary`,
      description: `${name} description`,
      status: "PUBLISHED",
      pricingRules: options.rate
        ? {
            create: {
              label: "Standard",
              basis: options.rate.basis,
              amountPaise: options.rate.amountPaise,
              childAmountPaise: options.rate.childAmountPaise ?? null,
              active: options.rate.active ?? true,
              seasonStart: options.rate.seasonStart ?? null,
              seasonEnd: options.rate.seasonEnd ?? null,
            },
          }
        : undefined,
    },
  });
}
