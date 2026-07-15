# Deploying on your own server

This is a standard **Next.js 14** app (Node server). It talks to **Postgres** (Neon) and
**Jira Cloud**. Below: prerequisites, environment, database, two run options (plain Node or
Docker), reverse proxy + HTTPS, and the Jira webhook.

## 1. Prerequisites
- **Node.js 18.17+** (20 LTS recommended) — only if running without Docker.
- A reachable **Postgres** (your existing Neon DB is fine; keep using its `DATABASE_URL`).
- A **public HTTPS URL** for the server (needed so Jira can POST webhooks).
- The **Atlassian API token** + the same secrets you used locally.

## 2. Get the code
```bash
git clone https://github.com/muhammadhanzla260/fams-jira-dashboard.git
cd fams-jira-dashboard
```

## 3. Environment (`.env.local`)
Create `.env.local` in the project root (it is git-ignored — never commit it):
```
DATABASE_URL=postgres://...        # your Neon pooled connection string
JIRA_BASE_URL=https://fams.atlassian.net
JIRA_EMAIL=you@fams.com
JIRA_API_TOKEN=__atlassian_token__
JIRA_PROJECTS=FM
JIRA_SCOPE_JQL=created >= -26w     # scope for the DB-backed Throughput/Work-mix charts
WEBHOOK_SECRET=__long_random__
CRON_SECRET=__long_random__
```

## 4. Database (one-time)
```bash
npm install
npm run db:setup        # creates tables + views + seeds the Dev/QA roster
npm run sync -- --full  # backfills issues (only needed for the Throughput + Work-mix charts)
```
> The per-member report, team totals, Delivery metrics, and Dev/QA tables all read
> **live from Jira** and do **not** depend on the backfill — they only need the roster
> (`team_members`), which `db:setup` seeds. The backfill matters only for the two
> DB-backed charts (Throughput, Work mix).

## 5a. Run with plain Node (PM2)
```bash
npm install
npm run build
# option A: pm2 (auto-restart, survives reboot)
npm i -g pm2
PORT=3000 pm2 start npm --name fams-dashboard -- start
pm2 save && pm2 startup
```
The app now listens on `http://localhost:3000`.

## 5b. Run with Docker
```bash
docker build -t fams-dashboard .
docker run -d --name fams-dashboard --env-file .env.local -p 3000:3000 fams-dashboard
```

## 6. Reverse proxy + HTTPS (nginx example)
Point your domain at the server and proxy to port 3000:
```nginx
server {
  server_name dashboard.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
Then add HTTPS with certbot: `sudo certbot --nginx -d dashboard.yourdomain.com`.

## 7. Jira webhook (keeps the DB-backed charts fresh in real time)
Jira → **System → Webhooks → Create**:
- URL: `https://dashboard.yourdomain.com/api/jira/webhook?secret=<WEBHOOK_SECRET>`
- Events: *Issue created/updated/deleted*, *Worklog created/updated*
- JQL scope: `project = FM`

## 8. Reconcile sweep (safety net for the charts)
Either keep the included GitHub Action (`.github/workflows/reconcile.yml` — set repo secrets
`APP_URL` and `CRON_SECRET`), or add a server cron:
```bash
# nightly: re-pull the last few days into the DB
0 1 * * *  cd /path/to/fams-jira-dashboard && npm run sync -- --days 3
```

## Notes
- **Live sections are slower per request** (they page through Jira); that is expected and
  shows a “Loading…” state. They are always exact regardless of DB freshness.
- **Secrets** (`.env.local`) never leave your server — they are git-ignored.
- The token uses your Jira permissions and is **read-only** in normal operation
  (the connector only GETs issues/worklogs and POSTs nothing back to Jira).
