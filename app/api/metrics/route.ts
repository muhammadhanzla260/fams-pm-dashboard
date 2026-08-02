import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // read live per-request; never prerender at build

// Powers the dashboard. KPI cards + per-member table + throughput trend.
export async function GET() {
  const [members, kpis, mttr, trend] = await Promise.all([
    query(`SELECT * FROM v_member_stats ORDER BY assigned_total DESC`),
    query(`
      SELECT
        (SELECT count(*) FROM issues)                                   AS created,
        (SELECT count(*) FROM v_completions)                            AS completed,
        (SELECT count(*) FROM v_deliveries)                             AS delivered,
        (SELECT count(*) FROM v_reopens)                                AS reopens,
        (SELECT count(DISTINCT issue_id) FROM v_completions)            AS completed_issues
    `),
    // MTTR = mean repair-only time (first in-progress -> first done, via v_cycle) over the
    // team's hotfix issues. Roster-scoped so it matches getKpis(); *24 turns days into hours.
    query(`
      SELECT
        round((avg(c.cycle_days) * 24)::numeric, 1)                            AS mean_hours,
        round((percentile_cont(0.5) WITHIN GROUP (ORDER BY c.cycle_days) * 24)::numeric, 1) AS median_hours,
        count(*)::int                                                         AS sample
      FROM v_cycle c
      JOIN issues i ON i.id = c.issue_id
      WHERE i.is_hotfix
        AND i.assignee_id IN (SELECT account_id FROM team_members)
    `),
    query(`
      SELECT to_char(date_trunc('week', completed_at), 'YYYY-MM-DD') AS week,
             count(*) AS completed
      FROM v_completions
      WHERE completed_at > now() - interval '12 weeks'
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  const k = kpis[0] ?? {};
  const reopenRate = k.completed > 0 ? Math.round((Number(k.reopens) / Number(k.completed)) * 1000) / 10 : 0;
  const m = mttr[0] ?? {};
  const mttrOut = {
    hours: m.mean_hours != null ? Number(m.mean_hours) : null, // headline MTTR (mean)
    median_hours: m.median_hours != null ? Number(m.median_hours) : null,
    sample: Number(m.sample) || 0,
  };

  return NextResponse.json({ kpis: { ...k, reopenRate, mttr: mttrOut }, members, trend });
}
