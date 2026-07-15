import { NextResponse } from "next/server";
import { listSprints } from "@/lib/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live list of FAMS sprints (active/future/closed). GET /api/sprints
export async function GET() {
  try {
    return NextResponse.json(await listSprints());
  } catch (err) {
    console.error("sprints error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
