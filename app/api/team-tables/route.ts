import { NextRequest, NextResponse } from "next/server";
import { getTeamTables } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live Dev/QA tables. GET /api/team-tables?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from/to (YYYY-MM-DD) required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getTeamTables(from, to));
  } catch (err) {
    console.error("team-tables error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
