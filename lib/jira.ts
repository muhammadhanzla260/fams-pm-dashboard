// Thin Jira Cloud REST client + helpers. Used by the reconcile sweep and the status-dim refresh.

const BASE = process.env.JIRA_BASE_URL!;

function authHeader() {
  const token = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`,
  ).toString("base64");
  return `Basic ${token}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry transient network failures and 429/5xx with exponential backoff.
// cache:"no-store" is forced on every request: this is a LIVE dashboard, and without it
// Next.js persists each Jira response to .next/cache/fetch-cache with a 1-year revalidate,
// so reports would silently serve stale data (wrong ticket counts / estimates / logged hrs).
async function fetchRetry(url: string, init: RequestInit, tries = 5): Promise<Response> {
  let lastErr: unknown;
  const noStore: RequestInit = { ...init, cache: "no-store" };
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, noStore);
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 2 ** attempt * 1000;
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err; // network blip (e.g. UND_ERR_CONNECT_TIMEOUT) — back off and retry
      await sleep(2 ** attempt * 1000);
    }
  }
  throw lastErr ?? new Error(`fetch failed after ${tries} attempts: ${url}`);
}

async function jiraGet(path: string): Promise<any> {
  const res = await fetchRetry(`${BASE}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jira GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// All statuses on the instance, so we can classify any status id by category.
export async function fetchStatuses(): Promise<
  { id: string; name: string; category_key: string }[]
> {
  const data = await jiraGet(`/rest/api/3/status`);
  return data.map((s: any) => ({
    id: String(s.id),
    name: s.name,
    category_key: s.statusCategory?.key ?? "indeterminate",
  }));
}

// Search issues with changelog, paginated. JQL controls scope (projects + window).
// Uses /rest/api/3/search/jql (the old /search was sunset in 2025 -> 410). This endpoint
// returns no `total`; it paginates with nextPageToken until isLast. changelog histories
// come back inline via expand.
export async function* searchIssues(
  jql: string,
  fields: string[],
): AsyncGenerator<any> {
  let nextPageToken: string | undefined;
  while (true) {
    const body: Record<string, unknown> = {
      jql,
      fields,
      maxResults: 100,
      expand: "changelog", // bulk caps histories (~40); sync detects truncation and back-fills full
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetchRetry(`${BASE}/rest/api/3/search/jql`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Jira search -> ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const issue of page.issues ?? []) yield issue;
    if (page.isLast || !page.nextPageToken) break;
    nextPageToken = page.nextPageToken;
  }
}

// Paginated search returning ALL matching issues (no changelog expand). Used by the
// live per-member report so numbers always match Jira exactly, regardless of DB sync state.
export async function searchAll(jql: string, fields: string[]): Promise<any[]> {
  const out: any[] = [];
  let nextPageToken: string | undefined;
  while (true) {
    const body: Record<string, unknown> = { jql, fields, maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetchRetry(`${BASE}/rest/api/3/search/jql`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Jira search -> ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const i of page.issues ?? []) out.push(i);
    if (page.isLast || !page.nextPageToken) break;
    nextPageToken = page.nextPageToken;
  }
  return out;
}

// All sprints on the FAMS board (Agile API). state=active,future,closed so future sprints
// appear automatically. Board id is configurable (default 1569 = FAMS v5 Scrum Board).
export type SprintInfo = { id: number; name: string; state: string; startDate?: string; endDate?: string };
export async function listSprints(): Promise<SprintInfo[]> {
  const boardId = process.env.JIRA_SPRINT_BOARD_ID || "1569";
  const all: any[] = [];
  let startAt = 0;
  while (true) {
    const data = await jiraGet(`/rest/agile/1.0/board/${boardId}/sprint?state=active,future,closed&startAt=${startAt}&maxResults=50`);
    all.push(...(data.values ?? []));
    if (data.isLast || !(data.values?.length)) break;
    startAt += data.values.length;
  }
  const num = (n: string) => {
    const m = n.match(/(\d+)\.(\d+)/);
    return m ? Number(m[1]) * 1000 + Number(m[2]) : 0;
  };
  return all
    .filter((s) => /FAMS Sprint/i.test(s.name))
    .map((s) => ({ id: s.id, name: s.name, state: s.state, startDate: s.startDate, endDate: s.endDate }))
    .sort((a, b) => num(b.name) - num(a.name)); // newest sprint first
}

// Like searchAll but expands the (bulk) changelog — for cycle-time derivation.
export async function searchWithChangelog(jql: string, fields: string[]): Promise<any[]> {
  const out: any[] = [];
  let nextPageToken: string | undefined;
  while (true) {
    const body: Record<string, unknown> = { jql, fields, maxResults: 100, expand: "changelog" };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await fetchRetry(`${BASE}/rest/api/3/search/jql`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Jira search -> ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const i of page.issues ?? []) out.push(i);
    if (page.isLast || !page.nextPageToken) break;
    nextPageToken = page.nextPageToken;
  }
  return out;
}

// Worklogs for one issue (the search payload doesn't include individual worklog authors).
export async function fetchWorklogs(issueId: string): Promise<any[]> {
  const data = await jiraGet(`/rest/api/3/issue/${issueId}/worklog`);
  return data.worklogs ?? [];
}

// FULL changelog for one issue via the dedicated paginated endpoint. The bulk /search/jql
// expand truncates changelog for long-history issues (dropping the earliest transitions),
// which corrupts first-done/first-in-progress derived metrics. This returns every history.
export async function fetchChangelog(issueId: string): Promise<any[]> {
  const all: any[] = [];
  let startAt = 0;
  while (true) {
    const data = await jiraGet(`/rest/api/3/issue/${issueId}/changelog?startAt=${startAt}&maxResults=100`);
    const vals = data.values ?? [];
    all.push(...vals);
    const total = data.total ?? all.length;
    if (vals.length === 0 || all.length >= total || data.isLast) break;
    startAt += vals.length;
  }
  return all; // shape: [{ id, author, created, items:[{field,from,fromString,to,toString}] }]
}

export const SEARCH_FIELDS = [
  "summary",
  "issuetype",
  "project",
  "status",
  "assignee",
  "reporter",
  "created",
  "updated",
  "resolutiondate",
  "timeoriginalestimate",
  "timespent",
  "labels",
  "customfield_10020", // Sprint
];
