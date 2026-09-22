# Architecture

## Monorepo layout

```
program-tracker/
├── apps/
│   ├── web/                  SvelteKit (Svelte 5) — trainer UI
│   └── api/                  ElysiaJS on Bun — REST API (:4000)
├── packages/
│   ├── shared/               zod domain schemas — THE contract (API + web + AI)
│   │   └── src/
│   │       ├── domain.ts     clients, exercises, programs, logs, e1RM math
│   │       └── ai.ts         provider registry, AiProgramDraft (LLM output gate)
│   └── db/                   Drizzle ORM + migrations + seed scripts
│       ├── src/schema.ts     table definitions
│       ├── drizzle/*.sql     generated migrations (committed)
│       └── scripts/          WGER exercise import
├── docker-compose.yml        Postgres 17 on :5433
└── docs/                     this documentation
```

Dependency direction: `apps/* → packages/{shared,db}`, `packages/db → packages/shared`.
Nothing imports from `apps/*`. `shared` imports nothing internal.

## Request/data flow

```
 SvelteKit web ──HTTP/JSON──▶ Elysia API ──Drizzle──▶ Postgres
                                  │
                                  ├─ zod validation on every write (shared schemas)
                                  └─ AI calls (fetch, OpenAI-compatible)
                                        ├─ zai     glm-4.5-flash  (default)
                                        ├─ openai  any model
                                        └─ mock    canned draft (no network, no key)
```

## Key design decisions

### 1. Programs are versioned documents; logs are normalized tables

- `programs.sessions` is a **jsonb document** validated by the shared
  `ProgramSession[]` zod schema at every write boundary. Rationale: a program is
  read and written as a whole, versioned by copying, and edited structurally by the
  trainer — document shape fits. Renaming an exercise later doesn't corrupt programs
  (they store exercise *references*, not embedded copies).
- Logs (`session_logs` + `set_logs`) are **normalized rows**. Rationale: the AI context
  builder and the trainer history view both query "all working sets for exercise X,
  client Y, last 8 weeks" — relational shape fits.

### 2. One schema package, everywhere

`packages/shared` defines every domain shape in zod. The API validates inputs with it,
the DB layer types jsonb columns from it, the web app types its DTOs from it, and the
AI draft gate parses raw LLM output with it. One definition, no drift.

### 3. AI is a suggestion engine behind a human gate

```
generate → LLM (JSON mode) → zod validate (1 retry) → ai_generations row
         → trainer reviews → approve → exercises resolved → program (status: draft)
         → trainer edits → activate → client-visible
```

- Approval resolves exercise references: catalog id → exact-name match → auto-create
  custom exercise. Unresolvable refs → 422, draft kept, trainer regenerates.
- `mock` provider makes the whole pipeline testable with zero keys and zero network.

### 4. Single-tenant today, multi-tenant-ready

One trainer row is lazily seeded (`lib/trainer.ts`). Every client-owned row already
carries `trainer_id`. Multi-trainer later = swap the helper for session auth — no
schema migration.

### 5. Numbers as `numeric` in Postgres

`weight_kg` and `rpe` are SQL `numeric` (exact decimal). The driver returns them as
strings; conversion to number happens at the aggregation boundary (`buildHistory`),
never stored back.

## Running & testing

| Command | What |
|---|---|
| `bun run dev` | API (:4000) + web (:5173) concurrently |
| `bun run db:up` / `db:down` | Postgres container |
| `bun run db:generate` | new migration from schema.ts changes |
| `bun run db:migrate` | apply migrations |
| `bun run seed:exercises` | WGER import (idempotent) |
| `bun test` | 39 tests; e2e suite auto-skips if Postgres is down |

API tests run in-process via Elysia's `app.handle()` (`src/app.ts` exports the app
without the `listen()` side effect; `src/index.ts` only boots).

## Ports & env

- Postgres `:5433` (avoids clashing with local 5432), API `:4000`, web `:5173`.
- See `.env.example` — notably `ZAI_API_KEY` (GLM flash is free tier),
  `ZAI_MODEL`, `ZAI_BASE_URL` for overrides. Provider config is env-driven per
  provider id (`<ID>_API_KEY`, `<ID>_BASE_URL`, `<ID>_MODEL`).

> Note: the GLM *Coding Plan* subscription is explicitly not licensed for SDK
> embedding — the app uses a regular pay-as-you-go Z.ai API key.
