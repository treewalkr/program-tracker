# Program Tracker

Training program tracker for personal trainers. Trainers manage clients, build and adjust
programs, and generate the next training block with AI assistance (Z.ai GLM flash first,
any OpenAI-compatible provider after). Clients log workouts against their assigned program.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | **Start here** — what we're building, the core loop, MVP scope, hard constraints |
| [docs/architecture.md](docs/architecture.md) | monorepo layout, stack, key design decisions |
| [docs/domain-model.md](docs/domain-model.md) | entities, program document structure, logging, history math |
| [docs/api.md](docs/api.md) | every endpoint with examples and error behavior |
| [docs/ai-integration.md](docs/ai-integration.md) | provider abstraction, prompt anatomy, validation gate, approval pipeline |
| [docs/roadmap.md](docs/roadmap.md) | phase status, acceptance criteria, deferred features, open decisions |

```
apps/web          SvelteKit (Svelte 5) — trainer UI
apps/api          ElysiaJS on Bun — REST API
packages/shared   zod domain schemas (single source of truth for API, web, and AI output)
packages/db       Drizzle ORM schema + migrations (Postgres)
```

## Key decisions (short version — details in docs/architecture.md)

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
- [x] Exercise library seed — `bun run seed:exercises` (WGER import, 719 exercises)
- [x] Logging endpoints (trainer enters results on client's behalf) + history aggregation
- [x] Mock provider — keyless end-to-end pipeline tests (`bun test` in apps/api)
- [ ] Trainer UI: program builder, draft review/approve, log entry
- [ ] Auth: trainer accounts (client portal cut from MVP)

### MVP scope decision
**No client portal for MVP.** The trainer runs the whole loop: builds programs, enters
logged results, reviews AI drafts. The normalized log schema keeps a future client
logging surface a pure additive change.

## Notes

- The GLM Coding Plan subscription is **not licensed for SDK embedding** — the app uses a
  regular pay-as-you-go Z.ai API key (flash models are free tier).
- Single-tenant today (one trainer, lazily seeded); every client-owned row already carries
  `trainer_id`, so multi-trainer is an auth change, not a migration.
