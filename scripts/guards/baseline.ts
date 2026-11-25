/**
 * Rewrite baseline.json from the tracked files as they stand. Run it only to record a
 * *lower* count after cleaning up hand-rolled controls (a rise is refused on purpose):
 *
 *   bun scripts/guards/baseline.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, toplevel } from "./git";
import { computeBaseline } from "./lib";

const root = toplevel()!;
const paths = git(["ls-files", "-z", "apps/web/src"], { cwd: root }).out.split("\0").filter((p) => /\.(ts|svelte)$/.test(p));
const baseline = computeBaseline(paths.map((path) => ({ path, content: readFileSync(join(root, path), "utf8") })));
const file = join(import.meta.dir, "baseline.json");
writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
const total = Object.entries(baseline).map(([rule, by]) => `${rule}: ${Object.values(by).reduce((a, b) => a + b, 0)}`);
console.log(`baseline.json written — ${total.join(", ")}`);
