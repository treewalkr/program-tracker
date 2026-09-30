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
| [docs/notifications.md](docs/notifications.md) | phase-change signals: rule engine, trigger paths, snooze/outbox design |
| [docs/roadmap.md](docs/roadmap.md) | phase status, go-live workstreams (Phase L), acceptance criteria, deferred features |

```
apps/web          SvelteKit (Svelte 5) — trainer UI
apps/api          ElysiaJS on Bun — REST API
packages/shared   zod domain schemas (single source of truth for API, web, and AI output)
packages/db       Drizzle ORM schema + migrations (Postgres)
```

## Key decisions (short version — details in docs/architecture.md)

- Programs = versioned jsonb documents; logs = normalized tables
- One zod schema package shared by API, web, AI gate — no drift
- AI is advisory: zod-gated drafts, trainer approval before anything is live
- Web talks to one `TrainerApi` interface; mock and real (Eden Treaty) adapters swap via `PUBLIC_API_MODE`
- Signals/metrics derived on read, never stored as truth

## Getting started

```bash
bun install
bun run db:up          # postgres via docker compose
bun run db:migrate     # apply drizzle migrations
cp .env.example .env   # add ZAI_API_KEY when ready (GLM flash tier is free)
cp apps/web/.env.example apps/web/.env   # PUBLIC_API_MODE=live to leave mock demo mode
bun run dev            # api :4000 + web :5173
```

Or run the whole stack in Docker (postgres + migrate + api + web):

```bash
docker compose up -d  # web :5173, api :4000, postgres :5433
```

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness |
| GET | `/v1/ai/providers` | configured AI providers (never secrets) |
| GET/POST/PATCH | `/v1/clients[...]` | client management |
| GET/POST/PUT/PATCH | `/v1/programs[...]` | programs; PUT bumps version; PATCH status activates (archives previous active) |
| POST | `/v1/ai/generate` | draft next block for a client (context: profile + program + 8-week log history + periodization context) |
| GET | `/v1/ai/generations` | audit trail |
| POST | `/v1/ai/generations/:id/approve` / `reject` | trainer gate |
| POST/GET | `/v1/logs/sessions` / `history` | trainer-entered results; 8-week per-exercise aggregation |
| GET/POST/DELETE | `/v1/schemes` | periodization scheme library (Phase L2) |
| GET/POST/PUT/DELETE | `/v1/ai/prompt-templates` | instruction template library (Phase L2) |
| GET | `/v1/notifications` | phase-change signals, computed on read (Phase L2/L3) |

## Roadmap

- [x] Domain schemas + validation gate (packages/shared)
- [x] DB schema + migrations (packages/db)
- [x] API: clients, programs, AI generate/validate/approve pipeline
- [x] Exercise library seed — `bun run seed:exercises` (WGER import, 719 exercises)
- [x] Logging endpoints (trainer enters results on client's behalf) + history aggregation
- [x] Mock provider — keyless end-to-end pipeline tests (`bun test` in apps/api)
- [x] Trainer UI (mocked demo, full loop): clients, builder with schemes, logging,
      AI generate/review/approve, signals + block pulse — see roadmap
- [x] Phase L — go live: shared zod extensions, templates/schemes/notifications
      endpoints, rule engine to shared, `PUBLIC_API_MODE=live` flip (done, live-tested)
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
