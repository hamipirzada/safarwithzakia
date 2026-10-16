import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Read lazily so `prisma generate` (run on install and in Docker builds) works without a
    // database; migrate/seed commands fail with a clear error if DATABASE_URL is missing.
    url: process.env.DATABASE_URL,
  },
});
