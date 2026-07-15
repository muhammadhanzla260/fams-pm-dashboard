import { NextRequest, NextResponse } from "next/server";
import { getTeamSummary } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live team totals across all members. GET /api/team-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getTeamSummary(from, to));
  } catch (err) {
    console.error("team-summary error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
