/**
 * Retention for the LLM log: unlabeled successful calls older than N days
 * (default 180) lose response_raw and reasoning. Labeled calls are untouched.
 *
 * Usage: bun run llm:prune [--days 180] [--dry-run]
 */
import { parseArgs } from "node:util";
import { pruneUnlabeled, RETENTION_DAYS } from "../src/lib/llm-dataset";

const { values } = parseArgs({
  options: {
    days: { type: "string", default: String(RETENTION_DAYS) },
    "dry-run": { type: "boolean", default: false },
  },
});

const days = Number(values.days);
if (!Number.isInteger(days) || days < 1) {
  console.error("llm-prune: --days must be a positive integer");
  process.exit(1);
}
const n = await pruneUnlabeled({ days, dryRun: values["dry-run"] });
console.log(values["dry-run"] ? `${n} call(s) would be pruned (older than ${days} days, unlabeled)` : `✓ pruned ${n} call(s)`);
process.exit(0);
