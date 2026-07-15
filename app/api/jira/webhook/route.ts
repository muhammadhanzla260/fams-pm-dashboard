import { NextRequest, NextResponse } from "next/server";
import { upsertIssue, ingestChangelog, upsertWorklog } from "@/lib/ingest";

export const runtime = "nodejs";

// Jira Cloud "system" webhooks don't sign payloads, so we verify a shared secret
// passed on the URL (?secret=...). Keep the URL itself secret (it's stored server-side in Jira).
function verify(req: NextRequest): boolean {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return false;
  return req.nextUrl.searchParams.get("secret") === expected;
}

export async function POST(req: NextRequest) {
  if (!verify(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const event: string = body.webhookEvent ?? "";

  try {
    if (event.startsWith("jira:issue_") && body.issue) {
      const issueId = String(body.issue.id);
      if (event === "jira:issue_deleted") {
        // Soft handling: leave history, just refresh state if present. (Hard delete optional.)
        return NextResponse.json({ ok: true, event });
      }
      await upsertIssue(body.issue);
      // The webhook carries a single changelog object for this change; normalize to history shape.
      if (body.changelog) {
        await ingestChangelog(issueId, [
          { id: body.changelog.id, author: body.user, created: body.issue.fields?.updated, items: body.changelog.items },
        ]);
      }
    } else if (event.startsWith("worklog_") && body.worklog) {
      await upsertWorklog(String(body.worklog.issueId), body.worklog);
    }
  } catch (err: any) {
    console.error("ingest error", err);
    return NextResponse.json({ error: "ingest failed", detail: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event });
}
