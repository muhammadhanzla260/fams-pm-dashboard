import { NextRequest, NextResponse } from "next/server";
import { getSprintMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live delivery metrics for one sprint. GET /api/sprint-metrics?sprint=<id>
export async function GET(req: NextRequest) {
  const sprint = req.nextUrl.searchParams.get("sprint");
  if (!sprint || !/^\d+$/.test(sprint)) {
    return NextResponse.json({ error: "numeric sprint id required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getSprintMetrics(Number(sprint)));
  } catch (err) {
    console.error("sprint-metrics error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
