# Safar With Zakia

Website and staff admin for **Safar With Zakia**, a Kashmir travel agency: destination and package pages, a custom trip builder with server-side pricing, enquiry management, and Gmail notifications through a durable outbox.

Rebuilt from https://safarwithzakiya.in/. See [docs/RESEARCH.md](docs/RESEARCH.md) for what was found there and what changed.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · PostgreSQL · Prisma 7 · Better Auth · Zod · Gmail API · Vitest · Playwright

## Quick start (local development)

Requirements: **Node 22** (`nvm use`), npm, and PostgreSQL 14+ (Docker is easiest).

```bash
# 1. Database (any PostgreSQL works; this starts one on port 55433)
docker run -d --name safar-pg -e POSTGRES_USER=safar -e POSTGRES_PASSWORD=safar_dev_pw \
  -e POSTGRES_DB=safar -p 127.0.0.1:55433:5432 -v safar-pg-data:/var/lib/postgresql/data postgres:16-alpine

# 2. Configuration
cp .env.example .env
#   set DATABASE_URL="postgresql://safar:safar_dev_pw@127.0.0.1:55433/safar?schema=public"
#   set AUTH_SECRET to the output of: openssl rand -base64 48

# 3. Install, migrate, seed
npm install                 # also generates the Prisma client
npm run db:migrate          # apply migrations (prisma migrate dev)
npm run db:seed             # destinations, package, images, draft testimonials, FAQs

# 4. First administrator (prints a one-time password unless ADMIN_PASSWORD is set)
npm run admin:create -- --email you@example.com --name "Your Name"

# 5. Run
npm run dev                 # http://localhost:3000 — admin at /admin
```

Without Gmail configuration everything works, and emails wait in the queue marked "not configured" (visible in Admin → Email delivery). To send real email, follow [docs/DEPLOYMENT.md §4](docs/DEPLOYMENT.md#4-gmail-api-business-mailbox).

**Seeded data is deliberately conservative.** Destination daily rates from the old site are seeded **inactive**, because their basis (per person or per group) was never stated, so the trip builder shows "Request a quote" until a staff member confirms and activates them. Old-site testimonials are seeded as **drafts**. See [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build (`prisma generate && next build`) / serve it |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests (needs database `safar_test`) |
| `npm run test:e2e` | Playwright end-to-end tests (run `npm run build` first; needs database `safar_e2e`) |
| `npm run test:all` | Type check, lint, unit, integration, e2e |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production (`prisma migrate deploy`) |
| `npm run db:seed` | Seed/refresh catalogue and image records (idempotent) |
| `npm run admin:create -- --email … --name …` | Create an admin; `--role STAFF` for staff; `--reset-password` to reset |
| `npm run worker:email` | Long-running email outbox worker (alternative to the cron endpoint) |

Test setup details: [docs/TESTING.md](docs/TESTING.md).

## Production

```bash
npm ci && npm run build
npm run db:deploy          # before starting a release that contains migrations
npm start                  # plus an email worker: cron endpoint or `npm run worker:email`
```

Or `docker compose --env-file .env.production up -d --build` (Postgres, migrations, app, email worker). Full guide, Gmail setup, HTTPS, staging, smoke tests and rollback: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Document | Contents |
|---|---|
| [RESEARCH](docs/RESEARCH.md) | Findings from the reference site |
| [PAGE_INVENTORY](docs/PAGE_INVENTORY.md) | Reference pages and rebuild routes |
| [USER_JOURNEYS](docs/USER_JOURNEYS.md) | Visitor and staff journeys, with tests |
| [ASSUMPTIONS](docs/ASSUMPTIONS.md) | Open business decisions and what the site does meanwhile |
| [TECHNICAL_DECISIONS](docs/TECHNICAL_DECISIONS.md) | Why things are built the way they are |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Modules, data model, key flows |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Hosting, Gmail API, staging, rollback |
| [OPERATIONS](docs/OPERATIONS.md) | Day-to-day running, backups, secrets |
| [SECURITY](docs/SECURITY.md) | Security and privacy controls |
| [TESTING](docs/TESTING.md) | Test suites, coverage, real-mailbox procedure, performance |
| [IMPLEMENTATION_STATUS](docs/IMPLEMENTATION_STATUS.md) | Feature status |

Photography: Wikimedia Commons contributors under Creative Commons licences, credited at `/credits`.
