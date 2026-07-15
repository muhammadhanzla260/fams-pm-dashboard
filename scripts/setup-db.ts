// Applies db/schema.sql then db/views.sql to DATABASE_URL — no psql needed.
//   npm run db:setup
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../lib/db";

async function run(file: string) {
  const sql = readFileSync(join(process.cwd(), "db", file), "utf8");
  await pool.query(sql); // simple-query protocol runs multiple statements
  console.log(`applied db/${file}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (.env.local)");
  await run("schema.sql");
  await run("views.sql");
  await run("team.sql");
  console.log("Database ready.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
