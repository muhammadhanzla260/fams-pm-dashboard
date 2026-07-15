import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds (Vercel). Windowed sweep stays well under this.

// Safety-net sweep, invoked by GitHub Actions cron. Re-pulls a recent window so any
// webhook Jira dropped gets reconciled. Protected by a shared header secret.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const windowDays = Number(req.nextUrl.searchParams.get("days") ?? "2");
  try {
    const result = await runSync({ windowDays });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("reconcile error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
