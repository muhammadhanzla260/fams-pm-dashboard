import { NextRequest, NextResponse } from "next/server";
import { getDeliveryMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live delivery metrics for the shared dashboard date range (this team doesn't run sprints).
// GET /api/delivery-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
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
    return NextResponse.json(await getDeliveryMetrics(from, to));
  } catch (err) {
    console.error("delivery-metrics error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
