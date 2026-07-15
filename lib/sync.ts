import { searchIssues, fetchWorklogs, fetchChangelog, SEARCH_FIELDS } from "./jira";
import { upsertIssue, ingestChangelog, upsertWorklog, refreshStatuses, loadStatusMap } from "./ingest";
import { query } from "./db";

function projectsClause(): string {
  const keys = (process.env.JIRA_PROJECTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return keys.length ? `project IN (${keys.join(",")})` : "";
}

// Extraction is scoped to a rolling creation window (JIRA_CREATED_WITHIN, default -12w),
// matching the agreed JQL: project = FM AND created >= -12w.
// full=true walks the whole window; windowed reconcile additionally limits to updated >= -N days.
export async function runSync(opts: { full?: boolean; windowDays?: number } = {}) {
  if (opts.full) await refreshStatuses();
  await loadStatusMap();

  // Extraction scope = a JQL filter. Default to the rolling creation window; override with
  // JIRA_SCOPE_JQL for any scope (e.g. a release: "fixVersion = 12103").
  const scope = process.env.JIRA_SCOPE_JQL || `created >= ${process.env.JIRA_CREATED_WITHIN || "-12w"}`;
  const parts = [projectsClause(), `(${scope})`];
  if (!opts.full) parts.push(`updated >= -${opts.windowDays ?? 2}d`);
  const jql = `${parts.filter(Boolean).join(" AND ")} ORDER BY created ASC`;

  let issues = 0;
  let worklogs = 0;
  for await (const issue of searchIssues(jql, SEARCH_FIELDS)) {
    // Whole-issue guard: a transient failure on one issue must not abort the sweep.
    // The next run / nightly reconcile re-pulls anything skipped (idempotent upserts).
    try {
      await upsertIssue(issue);
      // Use the bulk changelog; only fetch the full one when bulk truncated it (total > returned).
      // This keeps the common case (≤40 histories) to zero extra calls while staying complete.
      const cl = issue.changelog;
      let histories: any[] = cl?.histories ?? [];
      if (cl && typeof cl.total === "number" && histories.length < cl.total) {
        histories = await fetchChangelog(String(issue.id));
      }
      if (histories.length) await ingestChangelog(String(issue.id), histories);
      // Only hit the worklog endpoint when time was actually logged.
      if (issue.fields?.timespent) {
        for (const w of await fetchWorklogs(String(issue.id))) {
          await upsertWorklog(String(issue.id), w);
          worklogs++;
        }
      }
      issues++;
    } catch (err) {
      console.warn(`skipped ${issue.key}: ${String(err)}`);
    }
  }

  await query(
    `INSERT INTO sync_state (key, last_run) VALUES ('reconcile', now())
     ON CONFLICT (key) DO UPDATE SET last_run = now()`,
  );
  return { issues, worklogs, jql };
}
