# Architecture

A map of the system as it runs today. Details live in the linked docs:
[deploy.md](deploy.md), [ai-integration.md](ai-integration.md), [api.md](api.md),
[domain-model.md](domain-model.md), [notifications.md](notifications.md).

## Monorepo layout

```
program-tracker/
├── apps/
│   ├── api/                       ElysiaJS on Bun — REST API (:4000)
│   │   ├── src/app.ts             the app (no listen) — tests call app.handle()
│   │   ├── src/index.ts           boots it
│   │   ├── src/routes/            one Elysia plugin per resource
│   │   ├── src/lib/               services: auth, ownership, imports, chat, email, feedback…
│   │   ├── src/ai/                provider runtime, LLM client, prompts, mock, cancellation
│   │   ├── src/testing/           test DB setup (preload.ts, test-db.ts)
│   │   └── scripts/               feedback agent CLI, llm export/prune, import eval
│   └── web/                       SvelteKit (Svelte 5) — trainer UI, built as a static SPA
│       ├── src/lib/api/           TrainerApi seam: types.ts, mock/, real.ts, treaty.ts
│       ├── src/lib/               pure view logic (one module + test per concern)
│       ├── src/routes/            pages: clients, programs, chat, log, admin, feedback…
│       ├── worker/index.ts        Cloudflare Worker: SPA assets + /v1 proxy + keep-warm cron
│       └── wrangler.jsonc
├── packages/
│   ├── shared/                    zod schemas + pure domain logic — THE contract
│   │   └── src/                   domain, ai, signals, metrics, deload, autoreg, progression,
│   │                              import, vocabulary, roles, sessionTypes, llm, feedback…
│   └── db/                        Drizzle ORM
│       ├── src/schema.ts          table definitions
│       ├── drizzle/*.sql          generated migrations (committed)
│       ├── seed/exercises.sql     exercise library seed (idempotent)
│       ├── library/               curation + build of the exercise library JSON
│       └── scripts/               seed, pattern backfill, session migration
├── scripts/                       release + changelog draft
├── Dockerfile                     API image (Render)
├── docker-compose.yml             Postgres 17 on :5433 (+ optional full stack)
└── docs/
```

Dependency direction: `apps/* → packages/{shared,db}`, `packages/db → packages/shared`.
Nothing imports from `apps/*` at runtime (web imports `@pt/api` **types only**, for
Eden). `shared` imports nothing internal.

## Runtime topology

```
dev   browser ──▶ Vite :5173 ──/v1──▶ Elysia :4000 ──▶ Postgres :5433 (docker)

prod  browser ──▶ pt.pinroj.com  (Cloudflare Worker "program-tracker-web")
                    ├─ static SPA          apps/web/build
                    └─ /v1/*  ──proxy──▶  Render "program-tracker-api" (Docker, Elysia)
                                              ├─▶ Supabase Postgres (session pooler)
                                              ├─▶ DeepSeek / Z.ai  (OpenAI-compatible)
                                              └─▶ Resend           (email, HTTPS)
```

- One origin for the browser, so the session cookie stays first-party.
- The Worker's 10-minute cron pings `/health` so Render's free tier never sleeps.
- Pushing `main` runs CI (typecheck + test), then deploys: migrate Supabase → build
  and deploy the Worker → trigger the Render deploy for that commit. See
  [deploy.md](deploy.md).

## Request pipeline

`apps/api/src/app.ts` composes the app in this order:

1. `cors` (`CORS_ORIGINS`) and `openapi` — Scalar UI at `/openapi`; zod schemas render
   via `z.toJSONSchema`.
2. `/health` and `/v1/meta` — build id, no auth.
3. Public route groups, before the guard:
   - `auth` — Google OAuth sign-in/out.
   - `email` — unsubscribe links; the token in the link is the credential.
   - `agent-feedback` — the auto-reply agent; bearer `FEEDBACK_AGENT_TOKEN`, no session.
4. `trainerContext` (`lib/trainer-context.ts`) — resolves `trainerId` + `isAdmin` from
   the session cookie (401 if signed out), then `lib/ownership.ts` checks every id in
   params/query/body: anything owned by another trainer → **404**.
5. Every other `/v1` route.

The server's `idleTimeout` is 255 s so a long chat-revise call (reasoning model +
one validation retry) isn't dropped.

## Key design decisions

### 1. Programs are versioned documents; logs are normalized tables

- `programs.sessions` is a **jsonb document** validated by the shared
  `ProgramWeeksDocument` zod schema at every write boundary. A program is read and
  written as a whole, versioned by copying, and edited structurally by the trainer —
  document shape fits. Programs store exercise *references*, so renames don't corrupt
  them.
- Logs (`session_logs` + `set_logs`) are **normalized rows**. The AI context builder and
  the history view both ask "all working sets for exercise X, client Y, last N weeks" —
  relational shape fits.

### 2. One schema package, everywhere

`packages/shared` defines every domain shape in zod and holds the pure logic both
sides need (signals, block pulse, deload, autoregulation, import matching…). The API
validates with it, the DB types jsonb columns from it, the web types DTOs from it,
and the AI gate parses raw LLM output with it. One definition, no drift.

### 3. AI suggests; the trainer decides

```
generate → LLM (JSON mode) → zod validate (1 retry) → ai_generations row
         → trainer reviews / chats / revises → approve → exercises resolved
         → program (status: draft) → trainer edits → activate
```

- Providers (`KNOWN_PROVIDERS` in `packages/shared/src/ai.ts`): **`deepseek`**
  (default), **`zai`**, and **`mock`** (canned draft, no key, no network — the whole
  pipeline runs in tests and demos). All speak the OpenAI chat-completions dialect.
- Config is env-driven per provider id: `<ID>_API_KEY`, `<ID>_MODEL`, `<ID>_MODELS`,
  `<ID>_BASE_URL`. Keys stay server-side; `GET /v1/ai/providers` returns config only.
  Each provider declares its effort levels.
- Running generations can be cancelled (`ai/cancellation.ts`, in-process registry).
- Approval resolves exercise refs: catalog id → exact name → auto-created custom
  exercise. Unresolvable → 422, draft kept.
- Every LLM call is logged to `llm_calls` (+ large payloads in `llm_blobs`) with the
  trainer's labels in `llm_feedback`. `bun run llm:export` turns it into
  SFT/DPO/eval/few-shot datasets; `llm:prune` trims old raw responses.
  See [ai-integration.md](ai-integration.md) and [llm-logging-plan.md](llm-logging-plan.md).

### 4. Multi-tenant, invite-only Google sign-in

- Trainers sign in with Google; only invited emails get in. `ADMIN_EMAIL` is the
  platform admin and manages trainers at `/admin`.
- `auth_sessions` stores only a hash of each token; cookies are httpOnly, 30 days.
- Every trainer-owned row carries `trainer_id`; the ownership check in the request
  pipeline makes another trainer's data look like it doesn't exist (404).
- `AUTH_DISABLED=true` (tests, local hacking) acts as the oldest trainer, as admin
  (`lib/trainer.ts`).

### 5. Numbers as `numeric` in Postgres

`weight_kg` and `rpe` are SQL `numeric` (exact decimal). The driver returns strings;
conversion to number happens at the aggregation boundary (`buildHistory`) and is
never stored back.

### 6. Web ↔ API seam: one interface, two adapters

`apps/web/src/lib/api/types.ts` defines `TrainerApi`; every screen talks only to it.

- `mock/` — in-memory fixtures (`PUBLIC_API_MODE=mock`, the default). Demos and UI
  work need zero infra and no sign-in.
- `real.ts` — **Eden Treaty** transport (`PUBLIC_API_MODE=live`, `PUBLIC_API_URL`).

The mode is read via `$env/static/public` (set in `apps/web/.env`). Two wrinkles:

- Bun's isolated linker gives web and api separate `elysia` entries; for one type
  identity, `apps/web/tsconfig.json` aliases `elysia` to the api's copy.
- Eden revives ISO date strings into `Date`s; DTOs model dates as strings, so `unwrap`
  converts them back. Pages see identical shapes in both modes.

### 7. One signal engine, run on both sides

The phase rule engine and block pulse (`packages/shared/src/signals.ts`, `metrics.ts`)
run in the browser in mock mode and in the API for `GET /v1/notifications` and the
log-write hook (`lib/signals-service.ts`), which queues rows in `signal_outbox`
(no consumer yet). Snoozes: localStorage in mock mode, `signal_snoozes` in live mode.
See [notifications.md](notifications.md).

## Subsystems

- **Chat** (`routes/chat.ts`, `lib/chat-qa.ts`, `lib/proposal-turn.ts`) — Q&A about a
  client, and draft revision: every turn replies; change requests also carry a
  proposal, and only the trainer's Build writes a new generation (`lib/revision.ts`).
- **Imports** (`routes/imports.ts`, `lib/imports.ts`, `ai_imports`) — paste a program or
  log history; chunks are read by the LLM in parallel, then checked, matched to
  exercises and grouped in code. `bun run eval:import` scores providers on fixtures.
- **Client messages** (`routes/client-messages.ts`) — deterministic weekly stats →
  AI phrasing → trainer approves → copy to LINE. No delivery integration.
- **Feedback mode** (`routes/feedback.ts`, `feedback_*` tables) — trainers pin comments
  to UI elements; threads, reads and mutes. An off-server coding agent answers tickets
  through `/v1/agent/feedback` via `bun run feedback:agent` (`lib/feedback-ai.ts`).
- **Email** (`lib/mailer.ts`, `lib/feedback-notify.ts`) — Resend over HTTPS
  (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`); unset = silent no-op. Sends are recorded
  in `email_log`; unsubscribe links carry a per-person token and a scope. Admins
  preview templates and the outbox at `/admin/emails`.
- **Trainer libraries** — session types, kinetic chains, vocabulary + role labels,
  coaching rules (proposed from notes, active only once confirmed), prompt templates,
  periodization schemes, gold-standard examples (AI few-shot), and distilled
  preferences.

## Data model at a glance

~30 tables in `packages/db/src/schema.ts`, 45 committed migrations.

| Group | Tables |
|---|---|
| Tenancy | `trainers`, `auth_sessions` |
| Training | `clients`, `exercises`, `exercise_aliases`, `programs`, `session_logs`, `set_logs` |
| AI | `ai_generations`, `ai_imports`, `chat_messages`, `client_messages`, `llm_calls`, `llm_blobs`, `llm_feedback` |
| Libraries | `session_types`, `kinetic_chains`, `role_labels`, `glossary_terms`, `coaching_rules`, `prompt_templates`, `periodization_schemes`, `program_examples`, `trainer_preferences` |
| Signals | `signal_snoozes`, `signal_outbox` |
| Feedback & email | `feedback_items`, `feedback_comments`, `feedback_reads`, `feedback_mutes`, `email_log` |

See [domain-model.md](domain-model.md) for the shapes inside them.

## Running & testing

| Command | What |
|---|---|
| `bun run dev` | API (:4000) + web (:5173) |
| `bun run db:up` / `db:down` | Postgres container |
| `bun run db:generate` / `db:migrate` | new migration from `schema.ts` / apply migrations |
| `bun run db:seed` | exercise library (idempotent) |
| `bun run typecheck` | shared → db → api → web (`svelte-check`) |
| `bun run test` | every workspace's tests |
| `bun run storybook` | web component stories |
| `bun run feedback:agent` | auto-reply agent CLI (`inbox`, `answer`) |
| `bun run llm:export` / `llm:prune` | LLM log datasets / retention |
| `bun run eval:import` | score providers on import fixtures |
| `bun run changelog:draft` / `release` | release flow (see `AGENTS.md`) |

- API tests run in-process via `app.handle()`. DB-backed tests use a database whose
  name must end in `_test` (`TEST_DATABASE_URL`, default `program_tracker_test` on
  the compose Postgres) — anything else is refused.
- CI (`.github/workflows`) runs typecheck + test against a Postgres service, then
  deploys on pushes to `main`.

## Ports & env

- Postgres `:5433` (avoids clashing with a local 5432), API `:4000`, web `:5173`.
- Env, from `.env.example` (and `docs/deploy.md` for production):
  - **DB / server:** `DATABASE_URL`, `API_PORT`, `CORS_ORIGINS`
  - **Auth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
    `ADMIN_EMAIL`, `AUTH_DISABLED`
  - **AI:** `DEEPSEEK_API_KEY`, `ZAI_API_KEY`, `ZAI_BASE_URL` (+ `<ID>_MODEL(S)`)
  - **Email:** `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`
  - **Agent:** `FEEDBACK_AGENT_TOKEN` (API), `PT_API_URL` (CLI, via `.env.agent`)
  - **Web build:** `PUBLIC_API_MODE`, `PUBLIC_API_URL`

> Z.ai's *GLM Coding Plan* key is not licensed for app embedding — use a regular
> pay-as-you-go Z.ai API key.
