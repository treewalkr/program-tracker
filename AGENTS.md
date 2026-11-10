## End-to-End Type Safety

- **Always use [Eden Treaty](https://elysiajs.com/eden/treaty/overview)** as the frontend → backend client — types flow from the Elysia app's type to the SvelteKit frontend; never hand-write fetch clients or duplicate API types

## Code Style

- Svelte 5 runes syntax only — never legacy stores or `$:` reactive statements
- Follow Elysia best practices and ergonomics (see the `/elysia` skill)

## Skills Reference

- **`/elysia`** — Elysia APIs, patterns, and best practices; consult when implementing or reviewing API code instead of guessing
- **`svelte5-best-practices`** — Svelte 5 runes, snippets, and SvelteKit patterns; consult when writing or reviewing Svelte components
- **`impeccable`** — UI design and polish; consult to avoid generic "AI slop" design — every screen must feel intentional and bespoke (design direction in `BRIEF.md`)

## Planning & Delegation

- **Plan mode** — plan on Opus: `medium` effort for normal tasks, `high` for complex ones; for big features write the plan to `docs/<topic>-plan.md` and ask the open decisions
- **Build** — after the plan is approved, hand the implementation to `delegate_task` (Claude Opus) at `medium` effort; review its result (re-run tests, spot-check) before reporting
- **Worktrees** — complex or conflict-prone work (dirty main, overlapping files) goes on a new branch in a git worktree
- **Handback** — when done, suggest merging to main; if merging now is risky, suggest a PR instead
- **Push or release** — when commits on main are ready, recommend one with a reason: **release** for batches of user-visible features/UI; **push** for small fixes, internal or docs-only changes. Pushing main deploys to production via CI
  - **Release steps:** `bun run changelog:draft` → rewrite the `[draft]` lines in `CHANGELOG.md` › Unreleased for trainers (plain language, merge related lines, drop internal ones) → commit `docs: changelog for vX.Y.Z` → `bun run release` (refuses an empty or drafted Unreleased; stamps it with the version and date) → `git push --follow-tags origin main`
- **"status"** — when the user says just "status", report on every active thread in this project (subagents included): read each one's last message, then check branches and worktrees (ahead/behind/dirty), main vs `origin/main`, and the latest CI run. Reply with what's done, what's waiting and on whom, what's archivable, and one next action

# Commit Rules

## Frequency

- Commit often — one small, focused commit per logical change; never batch unrelated work into a single commit

## Message rules

- Prefix the message with a type: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- Keep the message very short (one line, imperative)
- No body
- No Co-Authored-By

## COMMITS.md

- Do **not** track `COMMITS.md` (it is gitignored). After every commit, regenerate it locally:
  ```bash
  git log --reverse --pretty=format:'%h %ad %s' --date=format:'%Y-%m-%d %H:%M:%S' > COMMITS.md
  ```
- Never stage or commit it.

## Backdated commits

When asked to commit with a specific date/datetime:
- Set both `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` to the requested date/datetime
- If only a date is given, pick a time after working hours (18:00–22:00) if the date is a weekday (Mon–Fri); on Sat/Sun any natural daytime time is fine. It must also be after the previous commit's time if same date.
- Always use natural-looking minutes/seconds (never round times like `12:00:00`; two commits must never share the exact same timestamp)
- Times are in the repo's local timezone (+07:00)
