## End-to-End Type Safety

- **Always use [Eden Treaty](https://elysiajs.com/eden/treaty/overview)** as the frontend → backend client — types flow from the Elysia app's type to the SvelteKit frontend; never hand-write fetch clients or duplicate API types

## Code Style

- Svelte 5 runes syntax only — never legacy stores or `$:` reactive statements
- Follow Elysia best practices and ergonomics (see the `/elysia` skill)

## Skills Reference

- **`/elysia`** — Elysia APIs, patterns, and best practices; consult when implementing or reviewing API code instead of guessing
- **`svelte5-best-practices`** — Svelte 5 runes, snippets, and SvelteKit patterns; consult when writing or reviewing Svelte components
- **`impeccable`** — UI design and polish; consult to avoid generic "AI slop" design — every screen must feel intentional and bespoke (design direction in `BRIEF.md`)

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
