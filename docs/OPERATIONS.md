# Operations

## Daily
- Check **Admin → Dashboard**: new enquiries, follow-ups due, failed emails.
- Work enquiries through their statuses. Use notes for call summaries and quotes.

## Email delivery
- **Admin → Email delivery** shows whether sending is possible, the connected mailbox, and every queued or failed message.
- *Failed* means Gmail rejected the message or it failed 6 times. Fix the cause, then **Retry**.
- *UNKNOWN_OUTCOME* means sending was interrupted, so it may or may not have arrived. Check the inbox or ask the customer before retrying, to avoid sending twice.
- *Reconnect needed*: Gmail access was revoked, expired, or `AUTH_SECRET` changed. Click **Reconnect Gmail**. Queued messages then send automatically.
- **Process queue now** runs the worker immediately. **Send a test email** proves the whole path works.
- Worker health: the logs show `email.worker_run` / `email.worker_tick` entries. With Docker, `docker compose logs -f email-worker` should show no "failed" lines.

## Content changes
| Task | Where |
|---|---|
| Packages, routes, rates, add-ons | Admin → Packages |
| Destinations, rates for custom trips | Admin → Destinations |
| Activate a destination rate after confirming its basis | Destinations → edit → Rates → set the basis → tick **Active** → Save |
| Offers and promo codes | Admin → Offers & promo codes |
| Testimonials (only genuine, with permission) | Admin → Testimonials |
| FAQs | Admin → FAQs |
| Home/About text, announcement banner | Admin → Site content |
| Phone, WhatsApp, email, offices, social links | Admin → Business details (admins) |

### Adding new photographs (developer task)
1. Make sure you have the right to use the photo (your own, or a licence that allows commercial use) and know the credit line.
2. Resize to about 2000 px on the long side, JPEG quality ~80, and strip metadata.
3. Put it in `public/images/...` and add an entry (path, alt text, width, height, credit, licence, source) to `src/content/images.ts`.
4. Deploy and run `npm run db:seed` (idempotent). The photo appears in the admin image pickers and on `/credits`.

## Staff accounts
Everyone changes their own password at **My account** (sidebar). Admin → Staff: create accounts (a temporary password is shown once; share it privately), change roles, deactivate leavers (their sessions end immediately), and reset passwords. There must always be one active administrator. If everyone is locked out, use the CLI:
```bash
npm run admin:create -- --email owner@example.com --reset-password   # or via `docker compose run --rm migrate npx tsx ...`
```

## Backups and recovery
- **Schedule:** a nightly logical backup, kept for 30 days, plus a backup before every deploy that includes migrations. Managed databases: enable automated backups and point-in-time recovery.
- **Docker Compose example (cron on the host):**
  ```bash
  # /etc/cron.d/safar-backup — 02:30 daily
  30 2 * * * root cd /srv/safar && docker compose exec -T db pg_dump -U safar -Fc safar > /srv/backups/safar-$(date +\%F).dump && find /srv/backups -name 'safar-*.dump' -mtime +30 -delete
  ```
  Copy backups off the server (object storage) and encrypt them, because they contain customer data.
- **Restore** (into an empty database, ideally rehearsed on staging first):
  ```bash
  docker compose stop app email-worker
  docker compose exec -T db dropdb -U safar safar && docker compose exec -T db createdb -U safar safar
  docker compose exec -T db pg_restore -U safar -d safar < /srv/backups/safar-YYYY-MM-DD.dump
  docker compose up -d
  ```
- Test a restore at least once a quarter.

## Data retention
Customer data lives in `enquiry` (and its notes, history and emails). Until the business sets a retention period (ASSUMPTIONS A-11): archive closed enquiries and delete them when no longer needed (Admin → enquiry → Delete permanently; administrators only, recorded in the audit log). Handle customer deletion requests the same way. Backups age out after 30 days.

## Rotating secrets
- `AUTH_SECRET`: signs everyone out and makes the stored Gmail token unreadable → reconnect Gmail afterwards.
- `EMAIL_WORKER_SECRET`: update the scheduler/worker at the same time (`CRON_SECRET` on Vercel).
- Gmail client secret: create a new secret in Google Cloud, update `GMAIL_CLIENT_SECRET`, redeploy, delete the old secret.
- Database password: update the DB user and `DATABASE_URL` together.

## Housekeeping (automatic)
- The worker endpoint deletes expired form-throttle rows.
- Better Auth removes expired sessions and verification tokens.
- Password-reset emails expire after one hour; if still unsent by then they are cancelled, not sent late.
