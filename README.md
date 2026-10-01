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

## Docs

Start with [docs/PLAN.md](docs/PLAN.md) — then
[architecture](docs/architecture.md), [domain model](docs/domain-model.md),
[API](docs/api.md), [AI integration](docs/ai-integration.md),
[notifications](docs/notifications.md), [roadmap](docs/roadmap.md).
