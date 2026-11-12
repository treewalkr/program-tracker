# Program Tracker

Training program tracker for personal trainers — build and adjust programs, generate the
next block with AI assistance, and log workouts against the assigned program.

## Stack

- `apps/web` — SvelteKit (Svelte 5) trainer UI
- `apps/api` — ElysiaJS on Bun
- `packages/shared` — zod schemas for nested JSON documents and AI output (shared by API and web)
- `packages/db` — Drizzle ORM schema + migrations (Postgres); the source for API row fields

## Quick start

```bash
bun install
bun run db:up          # postgres via docker compose
bun run db:migrate
bun run db:seed        # exercise library; safe to re-run
cp .env.example .env   # add ZAI_API_KEY
cp apps/web/.env.example apps/web/.env
bun run dev            # api :4000 + web :5173
```

Or run everything in Docker: `docker compose up -d`. Demo (mock) mode needs no sign-in.
API reference: `/openapi` (Scalar) while the API runs.

## More

- [Sign-in](docs/auth.md) — Google login, trainers, sessions
- [Tests](docs/testing.md) — `bun run test`, test database
- [Feedback mode](docs/feedback.md) — in-app review tool, AI auto-reply, fix agent
- [Releases](docs/releases.md) — versioning and deploy
- [Plan](docs/PLAN.md), [architecture](docs/architecture.md), [domain model](docs/domain-model.md),
  [API](docs/api.md), [AI integration](docs/ai-integration.md),
  [notifications](docs/notifications.md), [roadmap](docs/roadmap.md)
