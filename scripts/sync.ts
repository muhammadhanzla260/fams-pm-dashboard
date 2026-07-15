// CLI: backfill or windowed reconcile from the command line.
//   npm run sync -- --full         (first-time backfill: refresh statuses + walk all history)
//   npm run sync -- --days 7       (reconcile the last 7 days)
import { runSync } from "../lib/sync";

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const daysIdx = args.indexOf("--days");
  const windowDays = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 2;

  console.log(full ? "Full backfill…" : `Reconciling last ${windowDays}d…`);
  const result = await runSync({ full, windowDays });
  console.log("Done:", result);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
