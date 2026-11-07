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
cp .env.example .env   # add ZAI_API_KEY
cp apps/web/.env.example apps/web/.env
bun run dev            # api :4000 + web :5173
```

Or run the whole stack in Docker: `docker compose up -d`

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
build SHA, and screenshots of the element and the page.

Element source comes from Svelte's dev-build metadata, so it needs the dev server
(as `docker compose` runs it). A production build saves the selector and text only.

1. **Triage** at `/feedback`: write a triage note, then **Accept** or **Won't fix**.
2. **Hand to an agent**: `bun run feedback:export` writes accepted items to
   `feedback/feedback.md`, `feedback/feedback.json` and `feedback/shots/` (gitignored).
   Use `--status new,accepted` or `--status all` to widen it.
3. **Over HTTP**: `GET /v1/feedback/export?status=accepted&format=md|json`.
4. **Close the loop**: mark the item **Done** once it ships.

## Docs

Start with [docs/PLAN.md](docs/PLAN.md) — then
[architecture](docs/architecture.md), [domain model](docs/domain-model.md),
[API](docs/api.md), [AI integration](docs/ai-integration.md),
[notifications](docs/notifications.md), [roadmap](docs/roadmap.md).
