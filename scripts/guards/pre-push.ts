/**
 * pre-push: only a push to main is checked (it deploys). A release that touches the database
 * needs a fresh prod dump; a `chore: release` commit needs its tag and a finished changelog.
 * Full typecheck/test stay in CI, which the deploy already waits for.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { git, gitOut, lastReleaseTag, report } from "./git";
import { DUMP_DIR, type DumpFile, type Violation, checkReleaseDump, checkReleaseShape, touchesData } from "./lib";
import { nextVersion } from "../release-lib";

const ZERO = /^0+$/;
const violations: Violation[] = [];

for (const line of readFileSync(0, "utf8").split("\n").filter(Boolean)) {
  const [, localSha, remoteRef] = line.split(" ");
  if (remoteRef !== "refs/heads/main" || ZERO.test(localSha)) continue;

  const subject = gitOut(["log", "-1", "--format=%s", localSha]) ?? "";
  const releasing = /^chore: release v(\d+\.\d+\.\d+)$/.exec(subject);
  const previous = lastReleaseTag(localSha, { before: true });

  if (previous) {
    const changed = (gitOut(["diff", "--name-only", `${previous}..${localSha}`, "--", "packages/db"]) ?? "").split("\n").filter(Boolean);
    const since = Number(gitOut(["for-each-ref", "--format=%(creatordate:unix)", `refs/tags/${previous}`])) * 1000;
    const dir = process.env.PT_DUMP_DIR ?? DUMP_DIR;
    let dumps: DumpFile[] = [];
    try {
      dumps = readdirSync(dir).map((name) => ({ name, size: statSync(`${dir}/${name}`).size, mtimeMs: statSync(`${dir}/${name}`).mtimeMs }));
    } catch {
      // no dump dir yet: no dumps
    }
    let version = releasing?.[1];
    if (!version) {
      try {
        version = nextVersion(previous.slice(1));
      } catch {
        version = "X.Y.Z";
      }
    }
    violations.push(...checkReleaseDump({ dataChanged: touchesData(changed), dumps, sinceMs: since, version }));
  }

  if (releasing) {
    const tagCommit = gitOut(["rev-parse", "-q", "--verify", `refs/tags/v${releasing[1]}^{commit}`]);
    const changelog = git(["show", `${localSha}:CHANGELOG.md`]).out;
    violations.push(...checkReleaseShape({ subject, headSha: localSha, tagCommit, changelog }));
  }
}

if (violations.length) {
  report("pre-push refused this push", violations);
  process.exit(1);
}
