import { Pool } from "pg";

// Single shared pool. On serverless, the module is reused across warm invocations.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

// Idle clients on serverless Postgres (Neon) can be dropped by the server. Without this
// handler an idle-client error would crash the whole Node process.
if (!globalForPg.pgPool || process.env.NODE_ENV !== "production") {
  pool.on("error", (err) => console.error("pg pool idle-client error:", err.message));
}

// Transient connection failures we should retry rather than surface as a 500.
const TRANSIENT = new Set([
  "57P01", // admin shutdown
  "53300", // too many connections
  "08000", "08003", "08006", // connection exceptions
  "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE",
  "ENOTFOUND", "EAI_AGAIN", // DNS resolution blips (serverless Neon endpoint)
]);
const isTransient = (e: any) =>
  TRANSIENT.has(e?.code) ||
  /terminat|connection|timeout|reset|getaddrinfo|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(String(e?.message ?? ""));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await pool.query(text, params);
      return res.rows as T[];
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === 2) break;
      await sleep(250 * (attempt + 1)); // brief backoff, then retry the query
    }
  }
  throw lastErr;
}
