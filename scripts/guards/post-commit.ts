/** post-commit: regenerate the gitignored COMMITS.md (AGENTS.md › COMMITS.md). Never fails a commit. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, toplevel } from "./git";

try {
  const root = toplevel();
  if (root && git(["check-ignore", "-q", "COMMITS.md"], { cwd: root }).ok) {
    const log = git(["log", "--reverse", "--pretty=format:%h %ad %s", "--date=format:%Y-%m-%d %H:%M:%S"], { cwd: root });
    if (log.ok) writeFileSync(join(root, "COMMITS.md"), log.out);
  }
} catch {
  // a convenience file; never worth failing a commit
}
