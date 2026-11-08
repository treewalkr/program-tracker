# Product changelog — plan

Goal: a trainer-facing "what changed" history, kept in the repo and shown in the app.

## Decisions (made)

- **Audience:** trainers. Plain product language, not commit subjects.
- **Upkeep:** draft + edit. A script drafts the section from `feat:`/`fix:` commits; a human rewrites it before release.

## 1. `CHANGELOG.md` (repo root)

Format, newest first:

```md
# What's new

## Unreleased

## v0.1.9 — 2026-11-09

### New
- Paste a client's training history from notes and save it as past programmes and logs — with undo.
- Admins can open any client read-only and see their active programme.

### Fixed
- Deload weeks now lower the load index the way the deload rule says.
```

Rules for entries:
- Write for a trainer: what they can do now, or what works better. No internal names (mock, API, helper, migration, refactor).
- Merge related commits into one line. Drop internal-only changes.
- Sections: `### New`, `### Improved`, `### Fixed` (leave out empty ones).

**Backfill v0.1.0–v0.1.9** from each tag's range (`git log vPREV..vX --format=%s`, plus the tag annotation).
- v0.1.0 (317 changes, 2026-09-22 → 2026-11-07): one "First release" section — 6–10 headline capabilities, grouped (clients, programme builder, AI drafting, logging, block pulse, session types, settings). Take wording cues from `PRODUCT.md`.
- v0.1.5 has no feat/fix — write "Maintenance and reliability updates." only.

## 2. Release flow

- New `bun run changelog:draft` (`scripts/changelog-draft.ts`):
  - Collects `feat:`/`fix:` subjects since the last `v*` tag.
  - Fills `## Unreleased` with a draft: `### New` (feat) and `### Fixed` (fix), each line prefixed `- [draft] `.
  - Keeps any lines already under Unreleased that lack `[draft]` (hand-edited ones survive a re-run).
- `bun run release` (`scripts/release.ts`) changes:
  - Fails if `## Unreleased` is empty or any line still has `[draft]` — message tells you to run/finish `changelog:draft`.
  - Renames `## Unreleased` → `## vX.Y.Z — YYYY-MM-DD`, adds a fresh empty `## Unreleased` above it, stages `CHANGELOG.md` in the release commit.
  - `--current` (tag only) skips the changelog step.
- Pure logic (parse / draft / stamp) goes in `scripts/release-lib.ts` with tests next to the existing ones.
- Update the "Push or release" rule in `AGENTS.md`/`CLAUDE.md`: release = `changelog:draft` → edit → `docs:` commit → `bun run release` → push.

## 3. In-app "What's new"

- Route `/whats-new` in `apps/web`. Imports `CHANGELOG.md` with Vite `?raw` at build — no API call, works in demo and live mode.
- `src/lib/changelog.ts`: parse into `{ version, date, sections: { kind, items[] }[] }[]`; skip `Unreleased`. Unit tests.
- Render: version + date heading per release, items as plain lists. Use `renderMarkdown` only for inline formatting in items. Follow `impeccable` + `BRIEF.md`; keep it a quiet reading page, not a marketing page.
- Entry point: `VersionStamp` in the sidebar becomes a link to `/whats-new`.
- Small "new" dot on the stamp when the newest version differs from the one stored in `localStorage` (`pt:seen-version`); visiting the page clears it.

## Out of scope

- Emailing changelogs to trainers.
- Per-trainer read tracking on the server.

## Build

- Worktree branch `feat/changelog` (main has unrelated uncommitted work).
- Commits: `docs: backfill product changelog`, `feat: changelog draft script`, `feat: release stamps changelog`, `feat: whats new page`, `feat: new-version dot on version stamp`, `docs: release flow in AGENTS.md`.
- Checks: `bun run test`, `bun run typecheck`, then open `/whats-new` in demo mode.
