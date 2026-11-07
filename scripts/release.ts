/**
 * Cut a release: bump the version in every package.json, commit, and tag.
 *
 *   bun run release            0.1.3 → 0.1.4 (patch bump, the default)
 *   bun run release 0.2.0      explicit version (must be newer)
 *   bun run release --current  tag the current version as-is (no bump commit)
 *
 * Never pushes. Prints what to do next, including a warning when the release
 * carries DB migrations — run them on Supabase before pushing, because Render
 * deploys the API as soon as main is pushed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { nextVersion, releaseNotes } from "./release-lib";

const sh = (cmd: string) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const fail = (msg: string): never => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

const PACKAGES = ["package.json", "apps/api/package.json", "apps/web/package.json", "packages/db/package.json", "packages/shared/package.json"];

const args = process.argv.slice(2);
const tagOnly = args.includes("--current");
const explicit = args.find((a) => !a.startsWith("--"));

if (sh("git rev-parse --abbrev-ref HEAD") !== "main") fail("releases are cut from main");
if (sh("git status --porcelain")) fail("working tree is not clean — commit or stash first");

const current: string = JSON.parse(readFileSync("package.json", "utf8")).version;
const version = (() => {
  if (tagOnly) return current;
  try {
    return nextVersion(current, explicit);
  } catch (e) {
    return fail((e as Error).message);
  }
})();
const tag = `v${version}`;
if (sh(`git tag --list ${tag}`)) fail(`${tag} already exists`);

const lastTag = (() => {
  try {
    return sh("git describe --tags --abbrev=0 --match 'v*'");
  } catch {
    return null;
  }
})();
const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
const subjects = sh(`git log ${range} --format=%s`).split("\n").filter(Boolean);
const migrations = sh(`git log ${range} --diff-filter=A --name-only --format= -- packages/db/drizzle/*.sql`)
  .split("\n")
  .filter(Boolean)
  .map((m) => m.split("/").pop()!)
  .sort();

if (!tagOnly) {
  for (const file of PACKAGES) {
    const text = readFileSync(file, "utf8");
    const next = text.replace(/"version": "[^"]+"/, `"version": "${version}"`);
    if (next === text) fail(`${file} has no "version" field`);
    writeFileSync(file, next);
  }
  sh("bun install"); // keeps bun.lock's workspace versions in step
  sh(`git add ${PACKAGES.join(" ")} bun.lock`);
  sh(`git commit -q -m "chore: release ${tag}"`);
}

const notes = releaseNotes(version, subjects);
execSync(`git tag -a ${tag} -F -`, { input: notes });
sh(`git log --reverse --pretty=format:'%h %ad %s' --date=format:'%Y-%m-%d %H:%M:%S' > COMMITS.md`);

console.log(`\n${notes}\n`);
console.log(`Tagged ${tag} (${sh("git rev-parse --short HEAD")}). Nothing pushed.\n`);
console.log("Next:");
let step = 1;
if (migrations.length) {
  const shown = migrations.length > 3 ? [...migrations.slice(-3), `+${migrations.length - 3} earlier`] : migrations;
  console.log(`  ${step++}. Migrate Supabase FIRST (migrate skips ones already applied) — new: ${shown.join(", ")}`);
  console.log("     set -a && source .env.production && set +a && bun run db:migrate");
}
console.log(`  ${step++}. git push --follow-tags   (Render deploys the API)`);
console.log(`  ${step++}. Web: build apps/web with PUBLIC_API_MODE=live, then bunx wrangler deploy`);
