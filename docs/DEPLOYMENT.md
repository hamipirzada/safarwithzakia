# Deployment

The app is one Node.js server plus PostgreSQL, plus something that triggers the email outbox regularly. Three supported setups:

| Option | Good for | Email worker |
|---|---|---|
| **A. Docker Compose on a VPS** (recommended) | One small server you control (e.g. 2 GB VPS) | `email-worker` container (curl loop, every 30 s) |
| B. Vercel + managed Postgres (Neon, Supabase, RDS…) | Zero server maintenance | Scheduler calling `/api/cron/email-outbox` |
| C. Render / Railway / Fly | Managed containers | Their cron/worker feature, or the endpoint |

Every option needs Node 22 (bundled in the Docker image), PostgreSQL 14+ (16 tested), HTTPS on the public domain, and the environment variables from `.env.example`.

---

## 1. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Use a dedicated DB user that owns only this database (see SECURITY.md). Add `?sslmode=require` for managed databases. |
| `APP_URL` | yes | Public origin, e.g. `https://safarwithzakiya.in`. Used in email links, auth cookies (Secure when https) and SEO. |
| `AUTH_SECRET` | yes | `openssl rand -base64 48`. Rotating it signs everyone out and requires reconnecting Gmail. |
| `EMAIL_WORKER_SECRET` | for options A–C | `openssl rand -hex 32`. Protects `/api/cron/email-outbox`. |
| `ENQUIRY_RECIPIENT_EMAIL` | recommended | Default business inbox (can be overridden in Admin → Email delivery). |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` | for email | From the Google Cloud OAuth client (section 4). |
| `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_ADDRESS` | optional | Only if you authorise outside the admin. A mailbox connected in the admin takes precedence. |
| `TRUST_PROXY_HEADERS` | optional | `true` (default) behind a proxy that sets `X-Forwarded-For`; `false` if the app is reachable directly. |
| `ENQUIRY_RATE_LIMIT_PER_IP` / `_PER_EMAIL` | optional | Defaults 5 / 5. |
| `TEST_*` | never in production | Test-only loopback overrides. |

The server refuses to start with a clear list of missing or invalid variables.

## 2. Option A — Docker Compose on a VPS

```bash
# on the server (Docker + Compose installed)
git clone <repo> safar && cd safar
cp .env.example .env.production
#   edit .env.production:
#   DATABASE_URL=postgresql://safar:<POSTGRES_PASSWORD>@db:5432/safar?schema=public
#   POSTGRES_PASSWORD=<strong password>   APP_URL=https://your-domain
#   AUTH_SECRET=...  EMAIL_WORKER_SECRET=...  GMAIL_*=...  ENQUIRY_RECIPIENT_EMAIL=...
docker compose --env-file .env.production up -d --build
```

What starts:
- `db`: PostgreSQL 16 with a named volume `pgdata`.
- `migrate`: runs `prisma migrate deploy`, then exits. `app` waits for it to finish.
- `app`: the standalone Next.js server on `127.0.0.1:3000`.
- `email-worker`: calls the outbox endpoint every 30 seconds.

**First admin and initial content (once):**
```bash
docker compose --env-file .env.production run --rm migrate npx prisma db seed
docker compose --env-file .env.production run --rm migrate \
  npx tsx scripts/create-admin.ts --email owner@example.com --name "Zakia"
# prints a one-time temporary password; sign in at https://your-domain/admin/login
```
Pass `-e ADMIN_PASSWORD=...` to choose the password instead.

**HTTPS:** put a reverse proxy in front. Example `Caddyfile` (automatic Let's Encrypt certificates):
```
your-domain.com, www.your-domain.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```
Caddy sets `X-Forwarded-For`, so keep `TRUST_PROXY_HEADERS=true`. With nginx, set `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, do not append client-supplied values).

**Updating:**
```bash
git pull && docker compose --env-file .env.production up -d --build
# migrate runs first; app restarts only if migrations succeed
```

## 3. Option B — Vercel + managed Postgres

1. Create a Postgres database (Neon, Supabase, etc.). Copy the pooled connection string into `DATABASE_URL`.
2. Import the repository into Vercel. Build command: `npm run build` (runs `prisma generate`). Node 22.
3. Add all environment variables (Production and Preview separately; see Staging below).
4. Run migrations from your machine or CI against the production database before each deploy that contains new migrations: `DATABASE_URL=... npm run db:deploy`. Then `npm run db:seed` once, and `npm run admin:create -- --email ... --name ...` once.
5. **Email worker:** `vercel.json` runs `/api/cron/email-outbox` once a day (03:00 IST), which is the most the free Hobby plan allows. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, so **set `CRON_SECRET` to the same value as `EMAIL_WORKER_SECRET`**. For retries every few minutes at no cost, add a free external scheduler (for example cron-job.org) that calls the endpoint every 5 minutes:
   ```bash
   curl -fsS -X POST -H "Authorization: Bearer $EMAIL_WORKER_SECRET" https://your-domain/api/cron/email-outbox
   ```
   On a paid plan, the `vercel.json` schedule can instead be `*/5 * * * *`. Emails are also attempted immediately after each submission, so the scheduler is only the safety net for retries.
6. **Region:** `vercel.json` pins functions to Mumbai (`bom1`); create the database in Mumbai (ap-south-1) too.

### Zero-cost setup

| Piece | Free option | Limits to know |
|---|---|---|
| Hosting | Vercel Hobby | Vercel's terms restrict Hobby to non-commercial use; a business site may need Pro later. Daily cron only. |
| Database | Neon Free (Mumbai, pooled URL) | 0.5 GB storage; sleeps when idle, first request after a pause takes ~1 s. |
| Frequent email retries | cron-job.org (free) | Calls the endpoint every 5 minutes. |
| Email | Gmail API with the business mailbox | Free; Gmail sending limits apply. |
| Address | `your-project.vercel.app` | A custom domain is only needed if you want one (an existing domain can be pointed at Vercel for free). |

## 4. Gmail API (business mailbox)

The business must authorise its own mailbox. Nothing is sent until it does; enquiries are still saved and listed in the admin.

1. **Google Cloud project:** https://console.cloud.google.com → create a project (e.g. "Safar With Zakia website").
2. **Enable the Gmail API:** APIs & Services → Library → "Gmail API" → Enable.
3. **OAuth consent screen** (Google Auth Platform → Branding / Audience / Data access):
   - User type: **Internal** if the mailbox is on Google Workspace (no verification needed). **External** for an ordinary @gmail.com account.
   - App name, support email, and authorised domain = your site's domain.
   - Scopes: `https://www.googleapis.com/auth/gmail.send`, `openid`, `email`. Nothing else.
   - For External apps: while the app is in **Testing**, add the mailbox as a test user, but note that Google issues refresh tokens that **expire after 7 days** in Testing. Set the publishing status to **In production** for a lasting connection. Because `gmail.send` is a sensitive scope, Google shows an "unverified app" warning on the consent screen until the app is verified. The business owner can proceed through it for their own mailbox; verification is needed only if many outside accounts would connect.
4. **OAuth client:** Credentials → Create credentials → OAuth client ID → **Web application**.
   - Authorized redirect URIs: `https://your-domain/api/admin/gmail/callback` (add `http://localhost:3000/api/admin/gmail/callback` for local testing).
   - Copy the client ID and secret into `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`, and set `GMAIL_REDIRECT_URI` to the **exact** redirect URI.
5. **Connect:** deploy, sign in as an administrator → **Admin → Email delivery → Connect Gmail** → choose the business mailbox → allow "Send email on your behalf". You return with "Gmail connected".
6. **Set the business inbox** on the same page (or `ENQUIRY_RECIPIENT_EMAIL`), then click **Send a test email** and confirm it arrives. The page reports what Gmail actually returned.

Notes:
- Mail is sent *as* the connected mailbox (the From address is that mailbox). Internal notifications set Reply-To to the customer, so "Reply" answers them directly.
- A **service account cannot send from an ordinary @gmail.com mailbox.** Service accounts work only with Google Workspace domain-wide delegation, which this app does not use.
- Gmail sending limits apply (roughly 500 recipients/day for consumer Gmail, 2,000 for Workspace), which is ample for enquiry volumes.
- If access is revoked or the password is changed, the status shows "Reconnect needed". Queued emails wait and send after reconnecting.
- Alternative to step 5 for headless setups: obtain a refresh token for the mailbox with scope `gmail.send` (e.g. Google's OAuth Playground using your own client) and set `GMAIL_REFRESH_TOKEN` + `GMAIL_SENDER_ADDRESS`.

## 5. Staging

Use a separate database, a separate `AUTH_SECRET` and `EMAIL_WORKER_SECRET`, `APP_URL` = the staging URL, and either no Gmail configuration (emails stay queued as "not configured") or a separate test mailbox and recipient. Never point staging at the production database or business inbox. Vercel: set variables per environment. Compose: a second checkout with its own `.env.staging` and project name (`docker compose -p safar-staging --env-file .env.staging up -d`).

## 6. Production smoke test (after every deploy)

1. `/` loads with images, and `/robots.txt` lists `https://your-domain/sitemap.xml`.
2. `/destinations/gulmarg`, `/packages/kashmir-honeymoon-delight` and `/trip-builder` load.
3. Submit a contact message using an address you control: a reference appears.
4. Admin → Enquiries shows it. Admin → Email delivery: "Ready to send", nothing failed. The business inbox receives the notification and your address receives the acknowledgement.
5. Change the test enquiry to Spam or delete it.
6. `curl -X POST https://your-domain/api/cron/email-outbox` without the header returns 401.

## 7. Rollback

- **App:** redeploy the previous image or commit (`git checkout <tag> && docker compose up -d --build`, or "Promote previous deployment" on Vercel).
- **Database:** migrations are forward-only. Keep them additive (add columns and tables; remove in a later release) so the previous app version still works after a rollback. If a migration must be undone, restore the pre-deploy backup (OPERATIONS.md). Always take a backup before deploying migrations.

## 8. Monitoring and logs

The app writes one JSON line per event to stdout/stderr (e.g. `enquiry.created`, `email.sent`, `email.send_failed`, `email.worker_run`) without customer personal data. Collect them with your host's log drain (`docker compose logs -f app`, Vercel logs, etc.) and alert on `"level":"error"`. The admin dashboard surfaces failed emails and unconfigured or revoked Gmail. Add uptime monitoring on `/` and, if desired, an error tracker such as Sentry (not included).
