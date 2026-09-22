# Program Tracker

Training program tracker for personal trainers. Trainers manage clients, build and adjust
programs, and generate the next training block with AI assistance (Z.ai GLM flash first,
any OpenAI-compatible provider after). Clients log workouts against their assigned program.

## Architecture

```
apps/web          SvelteKit (Svelte 5) — trainer + client UI
apps/api          ElysiaJS on Bun — REST API
packages/shared   zod domain schemas (single source of truth for API, web, and AI output)
packages/db       Drizzle ORM schema + migrations (Postgres)
```

- **Monorepo**: Bun workspaces. `bun install` at the root.
- **Database**: Postgres 17 via Docker Compose (port 5433 to avoid clashes).
- **Programs are versioned documents**: `sessions` live in jsonb, validated by the shared
  zod schema at every write boundary. Logs are normalized tables (AI history queries).
- **AI never writes client-visible state**: the LLM emits an `AiProgramDraft` (JSON mode),
  it's zod-validated with one retry, stored as an audit record, and only becomes a real
  program (status `draft`) when the trainer approves it. Activation is a separate step.

## Getting started

```bash
bun install
bun run db:up          # postgres via docker compose
bun run db:migrate     # apply drizzle migrations
cp .env.example .env   # add ZAI_API_KEY when ready (GLM flash tier is free)
bun run dev            # api :4000 + web :5173
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness |
| GET | `/v1/ai/providers` | configured AI providers (never secrets) |
| GET/POST/PATCH | `/v1/clients[...]` | client management |
| GET/POST/PUT/PATCH | `/v1/programs[...]` | programs; PUT bumps version; PATCH status activates (archives previous active) |
| POST | `/v1/ai/generate` | draft next block for a client (context: client profile + current program + 8-week log history) |
| GET | `/v1/ai/generations` | audit trail |
| POST | `/v1/ai/generations/:id/approve` / `reject` | trainer gate |

## Roadmap

- [x] Domain schemas + validation gate (packages/shared)
- [x] DB schema + migrations (packages/db)
- [x] API: clients, programs, AI generate/validate/approve pipeline
- [ ] Exercise library seed (WGER import)
- [ ] Client workout logging endpoints (session_logs / set_logs)
- [ ] Trainer UI: program builder, draft review/approve
- [ ] Client UI: workout logging (PWA, offline later)
- [ ] Auth: trainer accounts + client invite links

## Notes

- The GLM Coding Plan subscription is **not licensed for SDK embedding** — the app uses a
  regular pay-as-you-go Z.ai API key (flash models are free tier).
- Single-tenant today (one trainer, lazily seeded); every client-owned row already carries
  `trainer_id`, so multi-trainer is an auth change, not a migration.
