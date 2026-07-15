import { NextRequest, NextResponse } from "next/server";
import { getAssigneeReport, getQaReport } from "@/lib/metrics";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-member date-range report. GET /api/report?member=Name&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const member = sp.get("member");
  const from = sp.get("from");
  const to = sp.get("to");
  if (!member || !from || !to) {
    return NextResponse.json({ error: "member, from and to are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    // QA members are measured by "Tested by", devs by assignee.
    const team = (await query<{ team: string }>(`SELECT team FROM team_members WHERE display_name = $1 LIMIT 1`, [member]))[0]?.team;
    if (team === "QA") {
      return NextResponse.json(await getQaReport(member, from, to));
    }
    return NextResponse.json({ kind: "dev", ...(await getAssigneeReport(member, from, to)) });
  } catch (err) {
    console.error("report error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
