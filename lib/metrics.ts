import { query } from "./db";
import { searchAll } from "./jira";

// Every metric is scoped to the IWMP & V5 team roster in `team_members`.
// (Usama has two Atlassian accounts mapped to one display name, so per-person rows merge.)

export type Kpis = {
  created: number; // tickets currently assigned to the team
  completed: number;
  delivered: number;
  reopens: number;
  open_wip: number;
  reopen_rate: number; // %
  est_accuracy: number | null; // % logged/estimated over issues with both
  tracking_coverage: number; // % team issues with any estimate or logged time
  cycle_days: number | null; // MEDIAN first-in-progress -> done, in days
  hotfixes: number; // team issues flagged hotfix
  hotfix_rate: number; // % of completed that are hotfixes
  person_days: number; // team logged time / 6h
};

export type SprintRow = { name: string; state: string; committed: number; delivered: number };

export type MemberRow = {
  member: string;
  team: string; // 'Dev' | 'QA'
  assigned_open: number;
  assigned_total: number;
  completed: number;
  delivered: number;
  reopened: number;
  logged_s: number;
  estimated_s: number;
};

export type TrendPoint = { week: string; completed: number; delivered: number; reopened: number };
export type StatusSlice = { category: string; n: number };

const ROSTER = `(SELECT account_id FROM team_members)`;

export async function getKpis(): Promise<Kpis> {
  const rows = await query<any>(`
    WITH team_issues AS (
      SELECT * FROM issues WHERE assignee_id IN ${ROSTER}
    ),
    tracked_pairs AS (
      SELECT time_spent_s, original_estimate_s FROM team_issues
      WHERE time_spent_s IS NOT NULL AND original_estimate_s IS NOT NULL AND original_estimate_s > 0
    )
    SELECT
      (SELECT count(*) FROM team_issues)                                           AS created,
      (SELECT count(*) FROM v_completions c JOIN team_issues i ON i.id = c.issue_id) AS completed,
      (SELECT count(*) FROM v_deliveries  d JOIN team_issues i ON i.id = d.issue_id) AS delivered,
      (SELECT count(*) FROM v_reopens     r JOIN team_issues i ON i.id = r.issue_id) AS reopens,
      (SELECT count(*) FROM team_issues WHERE status_category <> 'done')            AS open_wip,
      (SELECT count(*) FROM team_issues WHERE time_spent_s IS NOT NULL
            OR original_estimate_s IS NOT NULL)                                     AS tracked,
      (SELECT coalesce(sum(time_spent_s),0) FROM tracked_pairs)                     AS logged_both,
      (SELECT coalesce(sum(original_estimate_s),0) FROM tracked_pairs)              AS est_both,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY c.cycle_days)
         FROM v_cycle c JOIN team_issues i ON i.id = c.issue_id)                    AS cycle_median,
      (SELECT count(*) FROM team_issues WHERE is_hotfix)                            AS hotfixes,
      (SELECT coalesce(sum(time_spent_s),0) FROM worklogs WHERE author_id IN ${ROSTER}) AS logged_total
  `);
  const r = rows[0] ?? {};
  const created = Number(r.created) || 0;
  const completed = Number(r.completed) || 0;
  const hotfixes = Number(r.hotfixes) || 0;
  return {
    created,
    completed,
    delivered: Number(r.delivered) || 0,
    reopens: Number(r.reopens) || 0,
    open_wip: Number(r.open_wip) || 0,
    reopen_rate: completed ? round1((Number(r.reopens) / completed) * 100) : 0,
    est_accuracy: Number(r.est_both) > 0 ? round1((Number(r.logged_both) / Number(r.est_both)) * 100) : null,
    tracking_coverage: created ? round1((Number(r.tracked) / created) * 100) : 0,
    cycle_days: r.cycle_median != null ? round1(Number(r.cycle_median)) : null,
    hotfixes,
    hotfix_rate: completed ? round1((hotfixes / completed) * 100) : 0,
    person_days: Math.round(Number(r.logged_total) / (6 * 3600)),
  };
}

// Sprint commitment vs delivery (current-scope, issue counts). Most recent sprints first,
// returned oldest-first for charting. Delivered = committed issues completed by sprint end.
export async function getSprintDelivery(): Promise<SprintRow[]> {
  const rows = await query<SprintRow & { end_date: string }>(`
    SELECT s.name, s.state,
      count(DISTINCT isp.issue_id) AS committed,
      count(DISTINCT isp.issue_id) FILTER (
        WHERE comp.issue_id IS NOT NULL AND comp.completed_at <= coalesce(s.end_date, now())
      ) AS delivered
    FROM sprints s
    JOIN issue_sprints isp ON isp.sprint_id = s.id
    JOIN issues i ON i.id = isp.issue_id AND i.assignee_id IN ${ROSTER}
    LEFT JOIN v_completions comp ON comp.issue_id = isp.issue_id
    WHERE s.start_date IS NOT NULL
    GROUP BY s.id, s.name, s.state, s.end_date
    ORDER BY s.end_date DESC NULLS LAST
    LIMIT 8
  `);
  return rows
    .map((r) => ({ name: r.name, state: r.state, committed: Number(r.committed), delivered: Number(r.delivered) }))
    .reverse();
}

// One row per person; sums across a person's account(s) so duplicate accounts merge.
// Roster members with no activity still appear (LEFT JOIN), so the team list is complete.
export async function getMembers(): Promise<MemberRow[]> {
  return query<MemberRow>(`
    SELECT
      t.display_name                          AS member,
      t.team                                  AS team,
      coalesce(sum(m.assigned_open), 0)::int  AS assigned_open,
      coalesce(sum(m.assigned_total), 0)::int AS assigned_total,
      coalesce(sum(m.completed), 0)::int      AS completed,
      coalesce(sum(m.delivered), 0)::int      AS delivered,
      coalesce(sum(m.reopened), 0)::int       AS reopened,
      coalesce(sum(m.logged_s), 0)::bigint    AS logged_s,
      coalesce(sum(m.estimated_s), 0)::bigint AS estimated_s
    FROM team_members t
    LEFT JOIN v_member_stats m ON m.assignee_id = t.account_id
    GROUP BY t.display_name, t.team
    ORDER BY assigned_total DESC, completed DESC
  `);
}

export async function getThroughput(): Promise<TrendPoint[]> {
  return query<TrendPoint>(`
    WITH weeks AS (
      SELECT generate_series(date_trunc('week', now()) - interval '11 weeks',
                             date_trunc('week', now()), interval '1 week') AS wk
    )
    SELECT to_char(w.wk, 'MM-DD') AS week,
      (SELECT count(*)::int FROM v_completions c JOIN issues i ON i.id = c.issue_id
        WHERE i.assignee_id IN ${ROSTER} AND date_trunc('week', c.completed_at) = w.wk) AS completed,
      (SELECT count(*)::int FROM v_deliveries d JOIN issues i ON i.id = d.issue_id
        WHERE i.assignee_id IN ${ROSTER} AND date_trunc('week', d.delivered_at) = w.wk) AS delivered,
      (SELECT count(*)::int FROM v_reopens r JOIN issues i ON i.id = r.issue_id
        WHERE i.assignee_id IN ${ROSTER} AND date_trunc('week', r.reopened_at) = w.wk) AS reopened
    FROM weeks w ORDER BY w.wk
  `);
}

export async function getStatusMix(): Promise<StatusSlice[]> {
  return query<StatusSlice>(`
    SELECT coalesce(status_category, 'unknown') AS category, count(*)::int AS n
    FROM issues WHERE assignee_id IN ${ROSTER}
    GROUP BY 1 ORDER BY 2 DESC
  `);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// ---- Team summary (live from Jira, not the synced DB) --------------------------------

export type TeamSummary = {
  from: string;
  to: string;
  total_tickets: number; // all members' tickets created in range
  in_progress: number;
  completed: number;
  logged_hrs: number; // total logged on those tickets
  est_hrs: number; // total estimate on those tickets
};

// Live team totals — sum across ALL roster members of tickets WORKED ON in [from, to]
// (a worklog was logged on the ticket within the range). Fetched from Jira so it never
// lags a partial DB backfill. logged/est hrs come straight from each ticket's Time Tracking.
export async function getTeamSummary(from: string, to: string): Promise<TeamSummary> {
  const ids = (await query<{ account_id: string }>(`SELECT account_id FROM team_members`)).map((r) => r.account_id);
  const empty: TeamSummary = { from, to, total_tickets: 0, in_progress: 0, completed: 0, logged_hrs: 0, est_hrs: 0 };
  if (!ids.length) return empty;

  const projects = (process.env.JIRA_PROJECTS ?? "FM").split(",").map((s) => s.trim()).filter(Boolean).join(", ");
  const idList = ids.map((i) => `"${i}"`).join(", ");
  const jql = `project IN (${projects}) AND worklogDate >= "${from}" AND worklogDate <= "${to}" AND timespent > 0 AND assignee IN (${idList})`;

  const issues = await searchAll(jql, ["status", "timeoriginalestimate", "timespent"]);
  let in_progress = 0, completed = 0, est_s = 0, logged_s = 0;
  for (const it of issues) {
    const cat = it.fields?.status?.statusCategory?.key;
    if (cat === "indeterminate") in_progress++;
    else if (cat === "done") completed++;
    est_s += Number(it.fields?.timeoriginalestimate) || 0;
    logged_s += Number(it.fields?.timespent) || 0;
  }
  return {
    from,
    to,
    total_tickets: issues.length,
    in_progress,
    completed,
    logged_hrs: round1(logged_s / 3600),
    est_hrs: round1(est_s / 3600),
  };
}

// ---- Dev/QA tables (live, date-ranged) — Dev by assignee, QA by "tested by" -----------

export type DevRow = {
  member: string;
  assigned_open: number;
  assigned_total: number;
  completed: number;
  delivered: number;
  logged_hrs: number;
  est_hrs: number;
};
export type QaRow = {
  member: string;
  tested_total: number;
  tested_dev: number;
  tested_preview: number;
  tested_staging: number;
  tested_prod: number;
  delivered: number;
};
export type TeamTables = { dev: DevRow[]; qa: QaRow[] };

export async function getTeamTables(from: string, to: string): Promise<TeamTables> {
  const roster = await query<{ account_id: string; display_name: string; team: string }>(
    `SELECT account_id, display_name, team FROM team_members`,
  );
  const nameOf = new Map(roster.map((r) => [r.account_id, r.display_name]));
  const projects = (process.env.JIRA_PROJECTS ?? "FM").split(",").map((s) => s.trim()).filter(Boolean).join(", ");
  const win = `created >= "${from}" AND created <= "${to}"`;                                   // QA: by ticket creation
  const devWin = `worklogDate >= "${from}" AND worklogDate <= "${to}" AND timespent > 0`;      // Dev: by worklog activity
  const has = (v: any, id: string) => Array.isArray(v) && v.some((u) => (typeof u === "string" ? u : u?.accountId) === id);

  // ---- Dev: by assignee, tickets worked on (worklog) in range ----
  const devIds = roster.filter((r) => r.team !== "QA").map((r) => r.account_id);
  const devNames = [...new Set(roster.filter((r) => r.team !== "QA").map((r) => r.display_name))];
  const devIdList = devIds.map((i) => `"${i}"`).join(", ");
  const dev: DevRow[] = [];
  if (devIds.length) {
    const [issues, delivered] = await Promise.all([
      searchAll(`project IN (${projects}) AND ${devWin} AND assignee IN (${devIdList})`, ["assignee", "status", "timespent", "timeoriginalestimate"]),
      searchAll(`project IN (${projects}) AND ${devWin} AND assignee IN (${devIdList}) AND status WAS IN ("Released","Deployed")`, ["assignee"]),
    ]);
    const map = new Map<string, any>();
    const row = (n: string) => map.get(n) ?? map.set(n, { member: n, assigned_open: 0, assigned_total: 0, completed: 0, delivered: 0, logged_s: 0, est_s: 0 }).get(n);
    for (const it of issues) {
      const n = nameOf.get(it.fields?.assignee?.accountId); if (!n) continue;
      const r = row(n); r.assigned_total++;
      if (it.fields?.status?.statusCategory?.key === "done") r.completed++; else r.assigned_open++;
      r.logged_s += Number(it.fields?.timespent) || 0; r.est_s += Number(it.fields?.timeoriginalestimate) || 0;
    }
    for (const it of delivered) { const n = nameOf.get(it.fields?.assignee?.accountId); if (n && map.has(n)) row(n).delivered++; }
    for (const n of devNames) {
      const r = row(n);
      dev.push({ member: n, assigned_open: r.assigned_open, assigned_total: r.assigned_total, completed: r.completed, delivered: r.delivered, logged_hrs: round1(r.logged_s / 3600), est_hrs: round1(r.est_s / 3600) });
    }
    dev.sort((a, b) => b.assigned_total - a.assigned_total || b.completed - a.completed);
  }

  // ---- QA: by "tested by" (Tested on Dev/Preview/Stag/Prod) ----
  const qaIds = roster.filter((r) => r.team === "QA").map((r) => r.account_id);
  const qaIdList = qaIds.map((i) => `"${i}"`).join(", ");
  const F = ["12432", "12366", "12433", "12499"];
  const qa: QaRow[] = [];
  if (qaIds.length) {
    const orClause = F.map((f) => `cf[${f}] IN (${qaIdList})`).join(" OR ");
    const fields = ["customfield_12432", "customfield_12366", "customfield_12433", "customfield_12499"];
    const [issues, delivered] = await Promise.all([
      searchAll(`project IN (${projects}) AND ${win} AND (${orClause})`, ["status", ...fields]),
      searchAll(`project IN (${projects}) AND ${win} AND (${orClause}) AND status WAS IN ("Released","Deployed")`, fields),
    ]);
    const map = new Map<string, any>();
    qaIds.forEach((id) => map.set(id, { id, total: 0, dev: 0, preview: 0, staging: 0, prod: 0, delivered: 0 }));
    for (const it of issues) {
      const f = it.fields ?? {};
      for (const id of qaIds) {
        const d = has(f.customfield_12432, id), p = has(f.customfield_12366, id), s = has(f.customfield_12499, id), pr = has(f.customfield_12433, id);
        if (d || p || s || pr) { const m = map.get(id); m.total++; if (d) m.dev++; if (p) m.preview++; if (s) m.staging++; if (pr) m.prod++; }
      }
    }
    for (const it of delivered) {
      const f = it.fields ?? {};
      for (const id of qaIds) if (has(f.customfield_12432, id) || has(f.customfield_12366, id) || has(f.customfield_12499, id) || has(f.customfield_12433, id)) map.get(id).delivered++;
    }
    const byName = new Map<string, QaRow>();
    for (const [id, m] of map) {
      const n = nameOf.get(id) ?? id;
      const r = byName.get(n) ?? { member: n, tested_total: 0, tested_dev: 0, tested_preview: 0, tested_staging: 0, tested_prod: 0, delivered: 0 };
      r.tested_total += m.total; r.tested_dev += m.dev; r.tested_preview += m.preview; r.tested_staging += m.staging; r.tested_prod += m.prod; r.delivered += m.delivered;
      byName.set(n, r);
    }
    qa.push(...[...byName.values()].sort((a, b) => b.tested_total - a.tested_total));
  }

  return { dev, qa };
}

// ---- Delivery metrics (live, date-ranged — this team doesn't run sprints) -------------

export type DeliveryMetrics = {
  from: string;
  to: string;
  tickets: number; // team tickets worked on in range
  delivered: number; // reached Released / Deployed
  logged_hrs: number; // total man-hours logged on those tickets
  est_hrs: number; // total original estimate on those tickets
  person_days: number; // time invested = logged / 6h
};

export async function getDeliveryMetrics(from: string, to: string): Promise<DeliveryMetrics> {
  const ids = (await query<{ account_id: string }>(`SELECT account_id FROM team_members`)).map((r) => r.account_id);
  const empty: DeliveryMetrics = { from, to, tickets: 0, delivered: 0, logged_hrs: 0, est_hrs: 0, person_days: 0 };
  if (!ids.length) return empty;

  const projects = (process.env.JIRA_PROJECTS ?? "FM").split(",").map((s) => s.trim()).filter(Boolean).join(", ");
  const idList = ids.map((i) => `"${i}"`).join(", ");
  const jql = `project IN (${projects}) AND worklogDate >= "${from}" AND worklogDate <= "${to}" AND timespent > 0 AND assignee IN (${idList})`;

  const [issues, deliveredList] = await Promise.all([
    searchAll(jql, ["timespent", "timeoriginalestimate"]),
    searchAll(`${jql} AND status WAS IN ("Released","Deployed")`, ["key"]),
  ]);

  let logged_s = 0, est_s = 0;
  for (const it of issues) {
    logged_s += Number(it.fields?.timespent) || 0;
    est_s += Number(it.fields?.timeoriginalestimate) || 0;
  }

  return {
    from,
    to,
    tickets: issues.length,
    delivered: deliveredList.length,
    logged_hrs: round1(logged_s / 3600),
    est_hrs: round1(est_s / 3600),
    person_days: Math.round(logged_s / (6 * 3600)),
  };
}

// ---- Per-member date-range report (for the GM filter) --------------------------------

export type AssigneeReport = {
  member: string;
  from: string;
  to: string;
  // All metrics cover the member's tickets WORKED ON (worklog logged) within [from, to].
  total_assigned: number; // tickets assigned to member, worked on in range
  in_progress: number; // of those, currently in progress
  completed: number; // of those, reached Done
  logged_hrs: number; // Time Tracking logged total on those tickets
  est_hrs: number; // Time Tracking original estimate on those tickets
  status_breakdown: StatusBreakdownEntry[]; // by exact status name
  bugs_total: number; // of total_assigned, issuetype = Bug
  bugs: { key: string; url: string }[];
  reopened_total: number; // reopen EVENTS in [from, to] on tickets currently assigned to member
  reopen_rate: number; // % = reopened_total / completed
  reopened_tickets: ReopenedTicket[];
};

// One entry per distinct status; `tickets` links each ticket badge straight to Jira.
export type StatusBreakdownEntry = {
  status: string;
  count: number;
  category: string;
  tickets: { key: string; url: string }[];
};

export type ReopenedTicket = {
  key: string;
  url: string;
  reopen_count: number;
  last_reopened_at: string;
};

function jiraBrowseUrl(key: string): string {
  return `${(process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "")}/browse/${key}`;
}

export async function listMembers(): Promise<string[]> {
  const rows = await query<{ member: string }>(
    `SELECT DISTINCT display_name AS member FROM team_members ORDER BY 1`,
  );
  return rows.map((r) => r.member);
}

// from/to are 'YYYY-MM-DD'. Fetched LIVE from Jira (not the synced DB) so the numbers
// always match a Jira JQL exactly, regardless of backfill state. Aggregates all of the
// member's Atlassian accounts (handles duplicates like Usama's two accounts).
export async function getAssigneeReport(member: string, from: string, to: string): Promise<AssigneeReport> {
  const idRows = await query<{ account_id: string }>(
    `SELECT account_id FROM team_members WHERE display_name = $1`,
    [member],
  );
  const ids = idRows.map((r) => r.account_id);
  const empty: AssigneeReport = {
    member, from, to, total_assigned: 0, in_progress: 0, completed: 0, logged_hrs: 0, est_hrs: 0,
    status_breakdown: [], bugs_total: 0, bugs: [], reopened_total: 0, reopen_rate: 0, reopened_tickets: [],
  };
  if (!ids.length) return empty;

  const projects = (process.env.JIRA_PROJECTS ?? "FM").split(",").map((s) => s.trim()).filter(Boolean).join(", ");
  const idList = ids.map((id) => `"${id}"`).join(", ");
  // Tickets the member logged work on within [from, to] (worklogDate), same semantics as Jira.
  // logged/est hrs are read straight from each ticket's Time Tracking (lifetime totals).
  const jql = `project IN (${projects}) AND worklogDate >= "${from}" AND worklogDate <= "${to}" AND timespent > 0 AND assignee IN (${idList})`;

  const [issues, reopenedRows] = await Promise.all([
    searchAll(jql, ["status", "timeoriginalestimate", "timespent", "issuetype"]),
    // Reopen EVENTS in [from, to] on tickets currently assigned to this member, from the
    // synced changelog (issue_transitions) — live Jira JQL can't express "was done, now isn't".
    query<{ key: string; reopen_count: string; last_reopened_at: string }>(
      `SELECT i.key, count(*)::int AS reopen_count, max(r.reopened_at) AS last_reopened_at
       FROM v_reopens r
       JOIN issues i ON i.id = r.issue_id
       WHERE i.assignee_id = ANY($1::text[])
         AND r.reopened_at >= $2::date AND r.reopened_at < ($3::date + interval '1 day')
       GROUP BY i.key
       ORDER BY last_reopened_at DESC`,
      [ids, from, to],
    ),
  ]);

  let in_progress = 0, completed = 0, est_s = 0, logged_s = 0;
  const byStatus = new Map<string, { count: number; category: string; keys: string[] }>();
  const bugs: { key: string; url: string }[] = [];
  for (const it of issues) {
    const name = it.fields?.status?.name ?? "Unknown";
    const cat = it.fields?.status?.statusCategory?.key ?? "new";
    if (cat === "indeterminate") in_progress++;
    else if (cat === "done") completed++;
    est_s += Number(it.fields?.timeoriginalestimate) || 0;
    logged_s += Number(it.fields?.timespent) || 0;
    const e = byStatus.get(name) ?? { count: 0, category: cat, keys: [] as string[] };
    e.count++;
    e.keys.push(it.key);
    byStatus.set(name, e);
    if (it.fields?.issuetype?.name === "Bug") bugs.push({ key: it.key, url: jiraBrowseUrl(it.key) });
  }
  // Order like a board: To Do → In Progress → Done category, then by count within.
  const rank: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };
  const status_breakdown: StatusBreakdownEntry[] = [...byStatus.entries()]
    .map(([status, v]) => ({
      status,
      count: v.count,
      category: v.category,
      tickets: v.keys.map((key) => ({ key, url: jiraBrowseUrl(key) })),
    }))
    .sort((a, b) => (rank[a.category] - rank[b.category]) || b.count - a.count);

  const reopened_tickets: ReopenedTicket[] = reopenedRows.map((r) => ({
    key: r.key,
    url: jiraBrowseUrl(r.key),
    reopen_count: Number(r.reopen_count),
    last_reopened_at: r.last_reopened_at,
  }));
  const reopened_total = reopened_tickets.reduce((sum, r) => sum + r.reopen_count, 0);

  return {
    member,
    from,
    to,
    total_assigned: issues.length,
    in_progress,
    completed,
    logged_hrs: round1(logged_s / 3600),
    est_hrs: round1(est_s / 3600),
    status_breakdown,
    bugs_total: bugs.length,
    bugs,
    reopened_total,
    reopen_rate: completed ? round1((reopened_total / completed) * 100) : 0,
    reopened_tickets,
  };
}

// ---- QA member report — measured by "Tested by" (Tested on Dev/Preview/Prod) ----------
// QA people rarely own tickets; their output is who TESTED a ticket. A ticket counts once
// (distinct) if the member appears in any of the three stage fields.
const QA_STAGE_FIELDS = {
  dev: "customfield_12432",
  preview: "customfield_12366",
  prod: "customfield_12433",
  staging: "customfield_12499",
};

export type QaReport = {
  kind: "qa";
  member: string;
  from: string;
  to: string;
  tested_total: number; // distinct tickets tested at any stage
  tested_dev: number;
  tested_preview: number;
  tested_staging: number;
  tested_prod: number;
  delivered: number; // of tested tickets, reached Released/Deployed
  status_breakdown: StatusBreakdownEntry[];
};

export async function getQaReport(member: string, from: string, to: string): Promise<QaReport> {
  const ids = (await query<{ account_id: string }>(`SELECT account_id FROM team_members WHERE display_name = $1`, [member])).map((r) => r.account_id);
  const empty: QaReport = { kind: "qa", member, from, to, tested_total: 0, tested_dev: 0, tested_preview: 0, tested_staging: 0, tested_prod: 0, delivered: 0, status_breakdown: [] };
  if (!ids.length) return empty;

  const projects = (process.env.JIRA_PROJECTS ?? "FM").split(",").map((s) => s.trim()).filter(Boolean).join(", ");
  const fields = Object.values(QA_STAGE_FIELDS);
  const orClauses = ids.flatMap((id) => fields.map((f) => `${f.replace("customfield_", "cf[").concat("]")} = "${id}"`)).join(" OR ");
  const base = `project IN (${projects}) AND created >= "${from}" AND created <= "${to}" AND (${orClauses})`;

  const [issues, deliveredList] = await Promise.all([
    searchAll(base, ["status", QA_STAGE_FIELDS.dev, QA_STAGE_FIELDS.preview, QA_STAGE_FIELDS.prod, QA_STAGE_FIELDS.staging]),
    searchAll(`${base} AND status WAS IN ("Released","Deployed")`, ["key"]),
  ]);

  const inField = (v: any) => Array.isArray(v) && v.some((u) => ids.includes(typeof u === "string" ? u : u?.accountId));
  let tested_dev = 0, tested_preview = 0, tested_prod = 0, tested_staging = 0;
  const byStatus = new Map<string, { count: number; category: string; keys: string[] }>();
  for (const it of issues) {
    const f = it.fields ?? {};
    if (inField(f[QA_STAGE_FIELDS.dev])) tested_dev++;
    if (inField(f[QA_STAGE_FIELDS.preview])) tested_preview++;
    if (inField(f[QA_STAGE_FIELDS.prod])) tested_prod++;
    if (inField(f[QA_STAGE_FIELDS.staging])) tested_staging++;
    const name = f.status?.name ?? "Unknown";
    const cat = f.status?.statusCategory?.key ?? "new";
    const e = byStatus.get(name) ?? { count: 0, category: cat, keys: [] as string[] };
    e.count++;
    e.keys.push(it.key);
    byStatus.set(name, e);
  }
  const rank: Record<string, number> = { new: 0, indeterminate: 1, done: 2 };
  const status_breakdown: StatusBreakdownEntry[] = [...byStatus.entries()]
    .map(([status, v]) => ({
      status,
      count: v.count,
      category: v.category,
      tickets: v.keys.map((key) => ({ key, url: jiraBrowseUrl(key) })),
    }))
    .sort((a, b) => (rank[a.category] - rank[b.category]) || b.count - a.count);

  return { kind: "qa", member, from, to, tested_total: issues.length, tested_dev, tested_preview, tested_staging, tested_prod, delivered: deliveredList.length, status_breakdown };
}
