# FAMS Jira reporting dashboard

Real-time connector + custom dashboard that turns Jira activity on `fams.atlassian.net`
into team delivery metrics (created, completed, delivered, reopened, assigned, logged vs estimated).

## Why it's built this way

Probing the live instance surfaced three facts that shape the whole design:

1. **`resolutiondate` is unreliable** — issues reach the Done category ("Archived") with a null
   resolution date. So *completed* is derived from the **status-change history**, not a field.
2. **Time tracking is partial** — only some projects log time. Estimate/logged metrics treat null
   as "not tracked" and the UI shows coverage %, never a fake 0.
3. **Statuses are non-standard and vary per project** — e.g. `PR`, `Ready for Production`, `Archived`.
   Everything is classified by **status category**, not by name, via a status dimension table.

Consequence: **almost every metric is reconstructed from the changelog**, so we persist an
append-only transition log. This is the only approach that works on this instance.

## Architecture

```
Jira Cloud ──webhook──> /api/jira/webhook ──┐
                                            ├─> ingest() ─> Postgres (issues, transitions, worklogs)
GitHub Actions cron ─> /api/cron/reconcile ─┘            (status_dim, report_config)
                         (JQL sweep, safety net)                   │
                                                                   ▼  SQL views
                                              /api/metrics ─> Next.js dashboard
```

- **Webhooks** = real-time. **Reconcile cron** = safety net for dropped events (self-healing).
- One Next.js app, deployed from this repo to Vercel. Postgres on Neon/Supabase.

## Metric definitions (the important part)

| Metric | Definition |
|---|---|
| Created | `issues.created`, grouped by reporter / date |
| Assigned (WIP) | count of non-done issues where `assignee = X` |
| Completed | transition INTO a `done`-category status (first time) |
| Delivered | transition INTO the status in `report_config.delivered_status` (FM default **Ready For Deployment**) |
| Reopened | transition FROM a `done`-category status TO a non-done status |
| Logged hrs | sum of `worklogs.time_spent_s` (per author, per period) |
| Estimated | `issues.original_estimate_s` (null = not tracked) |
| Est. accuracy | logged / estimated, only over issues where both exist |

`completed`/`delivered`/`reopened` are attributed to the issue's **current assignee** in v1.
Assignee-change events are also captured (in `issue_transitions`) so this can be refined to
"assignee at time of transition" later without a backfill.

## Setup

1. `cp .env.example .env.local` and fill in `DATABASE_URL`, `JIRA_*`, `WEBHOOK_SECRET`, `CRON_SECRET`.
2. `npm install`
3. Create schema + views (no psql needed): `npm run db:setup`
4. Seed the status dimension + backfill history: `npm run sync -- --full`
5. `npm run dev` and open the dashboard.
6. Deploy to Vercel (connect this GitHub repo). Set the same env vars in Vercel.
7. In Jira → System → Webhooks, register `https://<your-app>/api/jira/webhook?secret=<WEBHOOK_SECRET>`
   for *Issue created/updated/deleted* and *Worklog created/updated*, scoped by JQL to `project = FM`.

## Open / configurable

- **Delivered status** lives in the `report_config` table — change it with one SQL update, no redeploy.
- Projects in scope are controlled by the webhook JQL and `JIRA_PROJECTS` (for the sweep).
