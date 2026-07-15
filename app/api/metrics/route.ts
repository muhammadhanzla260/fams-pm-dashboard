import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // read live per-request; never prerender at build

// Powers the dashboard. KPI cards + per-member table + throughput trend.
export async function GET() {
  const [members, kpis, trend] = await Promise.all([
    query(`SELECT * FROM v_member_stats ORDER BY assigned_total DESC`),
    query(`
      SELECT
        (SELECT count(*) FROM issues)                                   AS created,
        (SELECT count(*) FROM v_completions)                            AS completed,
        (SELECT count(*) FROM v_deliveries)                             AS delivered,
        (SELECT count(*) FROM v_reopens)                                AS reopens,
        (SELECT count(DISTINCT issue_id) FROM v_completions)            AS completed_issues
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

  return NextResponse.json({ kpis: { ...k, reopenRate }, members, trend });
}
