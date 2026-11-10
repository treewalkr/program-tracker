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
   links every image as `/v1/feedback/<id>/attachments/<attachmentId>`; the old
   `/v1/feedback/<id>/shot/element|page` links still work.
4. **Close the loop**: mark the item **Done** once it ships.

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
4. **Schedule**: a T3 scheduled task in the project root, every 30 minutes, prompt
   `/answer-feedback` (the skill in `.claude/skills/answer-feedback`). An empty inbox
   ends the run quietly.

The inbox holds open tickets where the reporter wrote last and the agent hasn't
answered that version of the ticket yet. `inbox` downloads every image on the ticket and
its public replies to `/tmp/pt-fb-agent/<handle>-<n>.<ext>`, lists which entry each came
from, and the skill opens them all before deciding. The old
`/v1/agent/feedback/<id>/shots/:kind` route stays for one release for older CLIs.

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
