import { query } from "./db";
import { fetchStatuses } from "./jira";

// ---- status category map (id -> 'new'|'indeterminate'|'done') -------------------------

let statusMap: Map<string, string> | null = null;

export async function loadStatusMap(force = false): Promise<Map<string, string>> {
  if (statusMap && !force) return statusMap;
  const rows = await query<{ id: string; category_key: string }>(
    `SELECT id, category_key FROM status_dim`,
  );
  statusMap = new Map(rows.map((r) => [r.id, r.category_key]));
  return statusMap;
}

// Refresh status_dim from Jira (run during --full sync and occasionally via cron).
export async function refreshStatuses(): Promise<number> {
  const statuses = await fetchStatuses();
  for (const s of statuses) {
    await query(
      `INSERT INTO status_dim (id, name, category_key) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category_key = EXCLUDED.category_key`,
      [s.id, s.name, s.category_key],
    );
  }
  await loadStatusMap(true);
  return statuses.length;
}

// ---- issue upsert ---------------------------------------------------------------------

const SECONDS = (v: any) => (typeof v === "number" ? v : null);

export async function upsertIssue(issue: any): Promise<void> {
  const f = issue.fields ?? {};
  const map = await loadStatusMap();
  const statusId = f.status?.id ? String(f.status.id) : null;
  const category = f.status?.statusCategory?.key ?? (statusId ? map.get(statusId) : null) ?? null;

  const summary: string | null = f.summary ?? null;
  const labels: string[] = Array.isArray(f.labels) ? f.labels : [];
  const isHotfix =
    labels.some((l) => String(l).toLowerCase() === "hotfix") ||
    /^\s*hotfix\s*\|\|/i.test(summary ?? "");

  await query(
    `INSERT INTO issues (id, key, project_key, issue_type, reporter_id, reporter_name,
        assignee_id, assignee_name, status_id, status_name, status_category,
        original_estimate_s, time_spent_s, created, resolutiondate, updated,
        summary, labels, is_hotfix, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (id) DO UPDATE SET
        key=EXCLUDED.key, project_key=EXCLUDED.project_key, issue_type=EXCLUDED.issue_type,
        reporter_id=EXCLUDED.reporter_id, reporter_name=EXCLUDED.reporter_name,
        assignee_id=EXCLUDED.assignee_id, assignee_name=EXCLUDED.assignee_name,
        status_id=EXCLUDED.status_id, status_name=EXCLUDED.status_name,
        status_category=EXCLUDED.status_category,
        original_estimate_s=EXCLUDED.original_estimate_s, time_spent_s=EXCLUDED.time_spent_s,
        created=EXCLUDED.created, resolutiondate=EXCLUDED.resolutiondate,
        updated=EXCLUDED.updated, summary=EXCLUDED.summary, labels=EXCLUDED.labels,
        is_hotfix=EXCLUDED.is_hotfix, raw=EXCLUDED.raw`,
    [
      String(issue.id),
      issue.key,
      f.project?.key ?? null,
      f.issuetype?.name ?? null,
      f.reporter?.accountId ?? null,
      f.reporter?.displayName ?? null,
      f.assignee?.accountId ?? null,
      f.assignee?.displayName ?? null,
      statusId,
      f.status?.name ?? null,
      category,
      SECONDS(f.timeoriginalestimate),
      SECONDS(f.timespent),
      f.created ?? null,
      f.resolutiondate ?? null,
      f.updated ?? null,
      summary,
      labels,
      isHotfix,
      JSON.stringify(f),
    ],
  );

  await syncSprints(String(issue.id), f.customfield_10020);
}

// The Sprint field (customfield_10020) is an array of sprint objects. Upsert each sprint
// and reset this issue's membership to the current set (current-scope semantics).
export async function syncSprints(issueId: string, sprintField: any): Promise<void> {
  const sprints = Array.isArray(sprintField)
    ? sprintField.filter((s) => s && typeof s === "object" && s.id != null)
    : [];
  for (const s of sprints) {
    await query(
      `INSERT INTO sprints (id, name, state, start_date, end_date, board_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, state=EXCLUDED.state,
         start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, board_id=EXCLUDED.board_id`,
      [String(s.id), s.name ?? null, s.state ?? null, s.startDate ?? null, s.endDate ?? null, s.boardId ?? null],
    );
  }
  await query(`DELETE FROM issue_sprints WHERE issue_id = $1`, [issueId]);
  for (const s of sprints) {
    await query(
      `INSERT INTO issue_sprints (issue_id, sprint_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [issueId, String(s.id)],
    );
  }
}

// ---- changelog -> transitions ---------------------------------------------------------

// Accepts either a list of histories (sweep: issue.changelog.histories)
// or a single webhook changelog object ({ id, items }). author/created come from the
// webhook envelope when histories don't carry them.
export async function ingestChangelog(
  issueId: string,
  histories: any[],
): Promise<void> {
  const map = await loadStatusMap();
  for (const h of histories) {
    const author = h.author ?? null;
    const at = h.created;
    const items = h.items ?? [];
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      if (it.field !== "status" && it.field !== "assignee") continue;
      const fromCat = it.field === "status" && it.from ? map.get(String(it.from)) ?? null : null;
      const toCat = it.field === "status" && it.to ? map.get(String(it.to)) ?? null : null;
      await query(
        `INSERT INTO issue_transitions (issue_id, changelog_item_id, field,
            from_value, from_string, to_value, to_string, from_category, to_category,
            author_id, author_name, at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (issue_id, changelog_item_id) DO NOTHING`,
        [
          issueId,
          `${h.id}:${idx}`,
          it.field,
          it.from ?? null,
          it.fromString ?? null,
          it.to ?? null,
          it.toString ?? null,
          fromCat,
          toCat,
          author?.accountId ?? null,
          author?.displayName ?? null,
          at,
        ],
      );
    }
  }
}

// ---- worklogs -------------------------------------------------------------------------

export async function upsertWorklog(issueId: string, w: any): Promise<void> {
  await query(
    `INSERT INTO worklogs (id, issue_id, author_id, author_name, time_spent_s, started, created)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET
        time_spent_s=EXCLUDED.time_spent_s, started=EXCLUDED.started`,
    [
      String(w.id),
      issueId,
      w.author?.accountId ?? null,
      w.author?.displayName ?? null,
      w.timeSpentSeconds ?? 0,
      w.started ?? null,
      w.created ?? null,
    ],
  );
}
