# Program Tracker

Training program tracker for personal trainers — build and adjust programs, generate the
next block with AI assistance, and log workouts against the assigned program.

## Stack

- `apps/web` — SvelteKit (Svelte 5) trainer UI
- `apps/api` — ElysiaJS on Bun
- `packages/shared` — zod domain schemas (single source of truth for API, web, and AI output)
- `packages/db` — Drizzle ORM schema + migrations (Postgres)

## Getting started

```bash
bun install
bun run db:up          # postgres via docker compose
bun run db:migrate
bun run db:seed        # exercise library (packages/db/seed/exercises.sql); safe to re-run
cp .env.example .env   # add ZAI_API_KEY
cp apps/web/.env.example apps/web/.env
bun run dev            # api :4000 + web :5173
```

Or run the whole stack in Docker: `docker compose up -d`

## Sign-in

Live mode is invite-only: trainers sign in with Google. Set four vars in
`.env` (or `.env.local` for Docker): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI` and `ADMIN_EMAIL` (see `.env.example`).

- `ADMIN_EMAIL` is the platform admin. They can always sign in, and their first
  sign-in links the original trainer row, so every existing client and program stays put.
  (`TRAINER_EMAIL` still works as a fallback name.)
- The admin adds trainers at **Platform → Trainers** (`/admin`) by name and Google email.
  That email can then sign in; the first sign-in links the Google account.
- Each trainer sees only their own clients, programs and libraries. Any id that belongs
  to another trainer answers 404.
- Disabling a trainer signs them out everywhere and blocks sign-in. Unused invites can
  be removed; trainers who have signed in can only be disabled, so their data is kept.
- Google emails must be verified.
- Sessions are httpOnly cookies that last 30 days. The DB stores only a hash of each token.
- Google accepts plain `http` only for `localhost`. To sign in from another device
  (e.g. Tailscale), serve the web app over https, then point `GOOGLE_REDIRECT_URI` at
  `https://<that-host>/v1/auth/google/callback` and register that URI in Google.
- Demo (mock) mode needs no sign-in.

API reference lives at `/openapi` (Scalar) when the api is running.

## Tests

```bash
bun run db:up         # postgres via docker compose
bun run test          # all workspaces
cd apps/api && bun test   # api suite only
```

DB-backed api tests (`apps/api/src/e2e.test.ts`, the opt-in `deepseek.live.test.ts`) run
against a dedicated `program_tracker_test` database on the compose Postgres
(`localhost:5433`). It is created, migrated, truncated and reseeded with fixture
exercises automatically at the start of every api test run — the live
`program_tracker` database is never touched, and tests refuse to start against any
database whose name does not end in `_test`.

Point at another test database with `TEST_DATABASE_URL` (the name must still end in
`_test`), e.g. `TEST_DATABASE_URL=postgres://user:pass@host:5432/my_db_test`.

When Postgres is down, the DB-backed tests are skipped; pure unit tests still run.

## Feedback mode

A review tool for the trainer. Click **Feedback** (bottom right) and every element
becomes pickable: click one, write a comment, send. Each item stores the route, the
element's source file and line, the component chain, nearest headings, viewport,
build SHA, and screenshots of the element and the page. Any composer — the feedback-mode
pin, **New ticket** on `/feedback` and every reply — also takes up to 6 images: paste,
drop or pick them, reorder by dragging (or Alt+←/→ on a focused thumbnail), remove with ×
or Delete. The browser re-encodes each to WebP, at most 2000px on the longest side and
2 MB; the API re-checks count, size and type (PNG, JPEG or WebP by content). Images live
in Postgres (`feedback_attachments`) and are visible exactly when their ticket or reply
is — an AI draft's or private note's only to the admin. Click a thumbnail to open the
viewer; arrow keys step through that ticket's or reply's images. On `/feedback` that metadata
sits behind each ticket's **Details** toggle (closed by default; the choice is
remembered per device).

Element source comes from Svelte's dev-build metadata, so it needs the dev server
(as `docker compose` runs it). A production build saves the selector and text only.

1. **Triage** at `/feedback`: write a triage note, then **Accept** or **Won't fix**.
2. **Hand to an agent**: **Copy N for agent** on `/feedback`, or `bun run feedback:export`,
   which writes accepted items to `feedback/feedback.md`, `feedback/feedback.json` and
   every image (ticket and replies) to `feedback/shots/<handle>-<n>.<ext>` (gitignored). Use `--status new,accepted` or `--status all` to widen it.
   Each item carries the auto-reply agent's latest **AI triage** (verdict, confidence, risk,
   fix plan, citations) while it still matches the ticket; once the ticket changes, it's left out.
3. **Over HTTP**: `GET /v1/feedback/export?status=accepted&format=md|json`. The Markdown
   links every image as `/v1/feedback/<id>/attachments/<attachmentId>`.
4. **Close the loop**: end the fix commit with the ticket, e.g.
   `fix: clearer rest timer (FB-012)`. Once that commit is live, CI's last deploy step
   (`apps/api/scripts/feedback-shipped.ts`) moves the ticket to **Done** with the live
   version, posts "Shipped in vX.Y.Z — reload the app to get it" (in Thai for a Thai
   ticket) and sends the reporter the usual status email. It reads the commits since the
   previous release tag, closes a ticket at most once per commit (a reopened ticket stays
   open) and leaves done or won't-fix tickets alone. It needs the GitHub secret
   `FEEDBACK_AGENT_TOKEN` (same value as the API's); without it the step only prints a
   notice, and it never fails the deploy. **Done** by hand still works for anything
   fixed without a commit. `bun run changelog:draft` words such a commit's line from
   the ticket itself (with `.env.agent`), so the trainer's own words start the
   changelog line; without the token it falls back to the commit text.

### Feedback auto-reply

A scheduled coding agent answers tickets the code can answer ("already exists",
"shipped after your build", "here's how"). Each answer is a private triage note for
the admin plus a reply that is either sent (badged **AI answer**, emailed as one) or
left on the ticket as a draft to **Send**, **Edit** or **Discard**. It never changes
a ticket's status, and it talks to the API only through `/v1/agent/feedback` with
its own token — no session, no database access. For a **bug** or **feature** the note
also carries a numbered fix plan and a risk, read from the code; the admin sees them
under the note, and the export hands them to the coding agent.

1. **API**: set `FEEDBACK_AGENT_TOKEN` (`openssl rand -base64 32`) where the API runs.
   Unset, the agent routes answer 401.
2. **Agent machine**: put the same token in a gitignored `.env.agent` at the repo root:
   ```
   PT_API_URL=https://pt.pinroj.com
   FEEDBACK_AGENT_TOKEN=…
   ```
   Check it with `bun run feedback:agent inbox`.
3. **Mode** (Settings → Email → *AI answers to feedback*, admin only):
   **Off**, **Drafts only** (default) or **Auto-send confident** — only high-confidence
   "exists / shipped / how-to" answers go out alone, at most one per reporter message.
4. **Run it**: on new work with the local watcher (below), or as a T3 scheduled task in
   the project root every 30 minutes, prompt `/answer-feedback` (the skill in
   `.claude/skills/answer-feedback`). An empty inbox ends the run quietly.

The inbox holds open tickets where the reporter wrote last and the agent hasn't
answered that version of the ticket yet. `inbox` downloads every image on the ticket and
its public replies to `/tmp/pt-fb-agent/<handle>-<n>.<ext>`, lists which entry each came
from, and the skill opens them all before deciding.

**Duplicates.** Before answering, the agent compares each ticket with every open one
(`bun run feedback:agent open`) and links a ticket that asks for the same change to the
older one: `bun run feedback:agent duplicate <id> --of FB-012`. The admin links and
unlinks on `/feedback` (the **Duplicate of** field under the triage note). The duplicate
shows *Duplicate of FB-012*, the original lists its duplicates. When the original closes
— **Done**, **Won't fix** (its reason is copied over) or a deploy — its open duplicates
close the same way and each reporter gets the usual status email. Both must be open; an
original is never itself a duplicate; reopening the original leaves duplicates closed.

#### Event-driven runs (`feedback:watch`)

Instead of waking the agent every 30 minutes, a local poller asks the API once a minute
whether there is work (`GET /v1/agent/feedback/pending`: inbox and fixable counts plus a
cursor that changes exactly when the inbox does) and starts the agent only then — on a new
ticket, a reporter's reply or an edit, or as a retry 30 minutes after a run that left
tickets behind. Runs never overlap, and a second watcher refuses to start.

```sh
bun run feedback:watch --once --dry-run   # what it would do now
bun run feedback:watch                    # poll every 60s (--interval 120 to slow it)
```

The agent it starts is `claude -p /answer-feedback` with a read-only tool allowlist, run
from the repo root; set `FEEDBACK_WATCH_CMD` to use something else. To switch over:

1. Load it with launchd so it survives logins — save as
   `~/Library/LaunchAgents/com.pinroj.pt-feedback-watch.plist` (fix the paths; launchd has no login PATH, so `bun` and `claude` must be on the PATH given), then
   `launchctl load ~/Library/LaunchAgents/com.pinroj.pt-feedback-watch.plist`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0"><dict>
     <key>Label</key><string>com.pinroj.pt-feedback-watch</string>
     <key>WorkingDirectory</key><string>/Users/you/dev/program-tracker</string>
     <key>EnvironmentVariables</key><dict>
       <key>PATH</key><string>/Users/you/.bun/bin:/Users/you/.local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
     </dict>
     <key>ProgramArguments</key><array>
       <string>/bin/zsh</string><string>-lc</string><string>bun run feedback:watch</string>
     </array>
     <key>RunAtLoad</key><true/>
     <key>KeepAlive</key><true/>
     <key>StandardOutPath</key><string>/tmp/pt-feedback-watch.log</string>
     <key>StandardErrorPath</key><string>/tmp/pt-feedback-watch.log</string>
   </dict></plist>
   ```
2. File a test ticket and check `/tmp/pt-feedback-watch.log` shows a run within a minute.
3. Then delete the 30-minute T3 schedule. Running both meanwhile is safe: an answer for
   a ticket version that's already answered gets a 409 and is skipped.

### Feedback fix agent

Accepted tickets the auto-reply agent judged **low risk** and **ready** (its plan is
checked against the code and leaves nothing to decide) can be fixed by an agent that
opens a **draft PR** per ticket; a person reviews and merges, and the deploy closes the
ticket from the `(FB-nnn)` commit. It never merges, never pushes `main`, never
force-pushes. Run `/fix-feedback` from the repo root (Claude Code / T3), or say
"`/fix-feedback` dry run" to go through every step without pushing or opening anything.
The skill drives `bun run feedback:fix`:

- `list [--max N]` — this run's tickets, oldest first (default 2, cap 5): accepted, not a
  duplicate, current AI note `bug`/`feature` with `risk: low` and `ready: true`. Tickets
  whose recorded PR is open or merged are skipped (`gh pr view`); a closed one may be
  retried. It says why every other accepted ticket was skipped.
- `prepare <id>` — worktree `../pt-fix-fb-nnn` on `fix/fb-nnn` from `origin/main`, brief
  in `/tmp/pt-fb-fix/`.
- `open <id> --worktree <path> [--dry-run]` — checks the branch is `fix/fb-nnn`, clean,
  1–10 commits each typed and ending `(FB-nnn)`; pushes that branch, opens the draft PR
  with `gh`, records its URL on the ticket (the admin sees **Fix PR #n** on the card).
  `--dry-run` (or `FEEDBACK_FIX_DRY_RUN=1`) prints the push and PR instead.

Needs `gh auth login` on the machine, and the same `.env.agent` as the auto-reply agent.

## Releases

Versions stay on `0.1.x` until the app is stable. Each deploy is a patch bump.
The build ID is the version plus the commit, e.g. `0.1.3+42a93f5`. It shows in
the sidebar footer, `GET /health` (`build`) and every feedback item.

1. `bun run release`: bumps every package.json (`0.1.3` → `0.1.4`), commits
   `chore: release v0.1.4`, and tags `v0.1.4` with notes from the `feat:`/`fix:` commits.
   Use `bun run release 0.2.0` for an explicit version, or `--current` to tag the
   current version without a bump. It never pushes.
2. `git push --follow-tags origin main` is the deploy. CI runs the tests, migrates
   Supabase, deploys the web Worker, then the API on Render, in that order
   (`.github/workflows/ci.yml`).

## Docs

Start with [docs/PLAN.md](docs/PLAN.md) — then
[architecture](docs/architecture.md), [domain model](docs/domain-model.md),
[API](docs/api.md), [AI integration](docs/ai-integration.md),
[notifications](docs/notifications.md), [roadmap](docs/roadmap.md).
