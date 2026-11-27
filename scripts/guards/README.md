# Guards

The AGENTS.md rules a machine can check, enforced in three layers that share one rule file
(`lib.ts`, one red and one green fixture per rule in `lib.test.ts`).

| Layer | Runs for | Skippable? | Job |
|---|---|---|---|
| git hooks (`scripts/githooks/` via `core.hooksPath`) | every agent and you | `--no-verify` | refuse the commit/push |
| Claude hooks (`claude.ts`) | Claude sessions and subagents | no | block the bypasses and never-delegate actions; give early feedback |
| CI (`verify-range.ts`, in the `test` job) | every PR and push to main | no | re-check messages, re-run red proofs; a failure stops the deploy |

`bun install` runs `prepare`, which sets `core.hooksPath` to `scripts/githooks` (shared by every
worktree of the clone). It does nothing under `CI` or without a `.git`. Every hook is a no-op
under `CI=true`, and a hook skips itself, with a note, if `bun` isn't on its PATH.

## AGENTS.md section (copy this in)

```md
## Guards

Git hooks (installed by `bun install`), Claude hooks and CI enforce these; details and fixtures in `scripts/guards/`.

- **commit-msg** — `type(scope)!?: subject` (types `feat fix docs chore refactor test perf ci build revert`, scopes `domain api server app web portal shared db` or none), subject ≤ 100 chars and imperative, no Co-Authored-By or "Generated with Claude Code", a feedback handle only as a trailing `(FB-012)`.
- **Red proof** — a `fix:` that touches non-UI source under `apps/*/src` or `packages/*/src` must add or change a test that fails on the parent's source and passes on the commit's. The hook runs it (throwaway worktrees, one at a time, a minute or so) and writes the `Red-Proof:` trailer; never type it by hand, CI re-runs it. No harness possible? Add a trailer `Red-Proof-Exempt: <reason> <why>` with a reason from `ui-only` (only .svelte/.css), `copy`, `config`, `no-harness` (needs a browser or prod). CI lists every exemption in the run summary.
- **pre-commit** — refuses `COMMITS.md`, `.env*`, `*.dump`, root `*.sql`; new migrations must pass the expand-only and RLS lints; a migration in the last release tag is never edited; `.svelte` files use runes only (no `$:`, `svelte/store`, `export let`); hand-rolled `<select>`, `<textarea>`, `class="input|btn|panel"` in routes, `fetch(` in web source and an `api.x()` call per item (inside an async `.map`, a `Promise.all(….map)` or a `for … of` body) in routes and `src/lib/pageLoads.ts` may not exceed `scripts/guards/baseline.json` (a ratchet: clean one up, then `bun scripts/guards/baseline.ts`). A justified exception: `// guard-ok: runes|raw-controls|eden|n+1 <why>` on the line (for n+1, on the call's line or the loop's) (CI prints how many exist).
- **post-commit** — regenerates `COMMITS.md`; don't run the command by hand.
- **pre-push** (to main) — a push that changes `packages/db` drizzle/ or seed needs a non-empty `/tmp/program-tracker/db/pre-v*.dump` newer than the last release tag (the `pg_dump` line is printed); a `chore: release vX.Y.Z` HEAD needs its tag and no `[draft]` changelog lines.
- **Claude hooks** — block `--no-verify`, `git commit -n`, `core.hooksPath`, force-push of main, `git reset --hard` on a dirty main, edits to `.env*`/`COMMITS.md`/released migrations, and, in a subagent, `git push`, `bun run release`, `pg_dump` and reading `.env*`.
- **CI** — `scripts/guards/verify-range.ts` checks only commits added by the push or PR, never anything at or before the `guards-v1` tag (warn-only while that tag doesn't exist).
```

## Turning it on

1. Merge, then tag the merge commit and push the tag, so CI starts enforcing from there:
   `git tag -a guards-v1 -m "guards" <merge commit> && git push origin guards-v1`.
   Until the tag exists on the remote, CI only warns. Nothing at or before it (by ancestry or date) is ever checked.
2. `bun install` once in the main checkout (sets `core.hooksPath`). Worktrees of that clone pick it up at once.
3. Claude hooks, in `~/.claude/settings.json` (the file gate keeps them inert in other repos):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [{ "type": "command", "command": "f=\"$CLAUDE_PROJECT_DIR/scripts/guards/claude.ts\"; [ -f \"$f\" ] || exit 0; exec bun \"$f\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "f=\"$CLAUDE_PROJECT_DIR/scripts/guards/claude.ts\"; [ -f \"$f\" ] || exit 0; exec bun \"$f\"" }]
      }
    ]
  }
}
```

   The subagent bans key on `agent_id` in the hook input. Confirm your Claude Code version sends it
   for subagent tool calls (a subagent running `git push origin main` should be blocked and the
   main thread's not); if it doesn't, those four rules never fire.

## What each file does

| File | Role |
|---|---|
| `lib.ts` | the rules: pure functions, no I/O |
| `git.ts` | git/process helpers |
| `commit-msg.ts`, `pre-commit.ts`, `post-commit.ts`, `pre-push.ts` | hook entry points (shims in `scripts/githooks/`) |
| `red-proof.ts` | the proof runner: `bun scripts/guards/red-proof.ts <sha>` or `--staged` |
| `verify-range.ts` | CI: `bun scripts/guards/verify-range.ts <base> <head>` (`--warn` to never fail) |
| `claude.ts` | Claude hook entry |
| `baseline.ts`, `baseline.json` | the ratchet counts |

## Red proof, in detail

- Tests = added or changed `*.test.ts` in the commit, plus changed files under `__fixtures__/` or `testing/`.
- **Red:** a throwaway worktree at the parent, the commit's test files copied in, `bun test` in their package. It must fail by assertion (`(fail)` lines). For a `fix:`, a test that only fails to load (missing module or export) is not red; for other types it is.
- **Green:** a worktree at the commit; the same tests pass.
- Every test skipped (Postgres down, run `bun run db:up`) is an error, never green.
- One proof at a time machine-wide (`$TMPDIR/pt-guards/proof.lock`); worktrees are removed in `finally` and on a signal. Install runs with `--ignore-scripts` so `prepare` never touches `core.hooksPath` from a worktree.
- Amends are proven against `HEAD^`; the hook finds `--amend` from its parent process (best effort; CI re-proves the final commit anyway).
- A `fix:` that changes only tests, `.svelte`/`.css`, or files outside `apps/*/src` and `packages/*/src` needs no proof.

## Known limits

- Regex rules can misfire on odd input (`$:` in markup text, `fetch(` to a non-API URL): add the `guard-ok` escape.
- The Claude Bash rules read the command's tokens; a command built at runtime (`$(…)`, variables) is not seen.
- Git hooks and Claude hooks only run where installed; CI is what a Pi child or `--no-verify` can't dodge, and it checks messages and proofs, not the staged-file rules.
