# PLAN — Training Program Tracker

> The one document that answers "what are we building". Read this first.
> Details live in the sibling docs: [architecture](architecture.md) ·
> [domain model](domain-model.md) · [API](api.md) · [AI integration](ai-integration.md) ·
> [roadmap](roadmap.md).

## What this is

A web platform for **personal trainers** to manage clients and their training programs,
track results, and generate the **next consecutive program block with AI assistance**.

- Trainer builds a program → assigns it to a client → client trains → trainer logs the
  results → AI drafts the next block from the logged history → trainer reviews, edits,
  approves → new program goes live. Repeat every mesocycle.
- AI default: **Z.ai GLM-4.5-Flash** (free tier, OpenAI-compatible API). Any
  OpenAI-compatible provider (OpenAI, Groq, OpenRouter…) can be added by config.
- **The AI never touches anything the client can see.** It only produces a *draft*; a
  human trainer approves it. (Professional liability sits with the trainer.)

## Who uses it

| Role | MVP status | What they do |
|---|---|---|
| **Trainer** | ✅ the only user | Everything: manage clients, build/adjust programs, log client results, review AI drafts |
| **Client** | ❌ cut from MVP | No portal. Future: log workouts themselves, view their program |

**MVP decision (2026-09-22): no client portal.** The trainer runs the whole loop —
clients report results however they already do (chat, call), trainer enters them.
The database schema already supports future client logging (normalized log tables),
so adding a portal later is additive, not a migration.

## The core loop (MVP)

```
┌─────────────────────────────── TRAINER ───────────────────────────────┐
│                                                                       │
│  1. Create client         name, email, goals, limitations, days/week  │
│  2. Build program         sessions → exercises → prescribed sets      │
│     (or ask AI first)     from 719-exercise catalog + customs         │
│  3. Activate program      auto-archives client's previous program     │
│  4. Client trains         (outside the app — gym, paper, chat)        │
│  5. Log results           trainer enters sets: weight/reps/RPE        │
│  6. Generate next block   AI gets: profile + program + 8-week logs    │
│                           + catalog → returns JSON draft              │
│  7. Review draft          rationale, sessions, set-by-set             │
│  8. Approve → draft pgm   created in `draft` status; edit freely      │
│  9. Activate new block    → back to step 3                            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

Every AI generation is stored as an audit record (prompt context implied, draft,
validation status, approval decision) — nothing the model produces is silently applied.

## Stack (what exists today)

| Piece | Tech | Where |
|---|---|---|
| Frontend | SvelteKit (Svelte 5, runes) | `apps/web` |
| API | ElysiaJS on Bun | `apps/api` |
| Domain contracts | zod schemas — single source of truth for API, web, and AI output | `packages/shared` |
| Database | Postgres 17 + Drizzle ORM + migrations | `packages/db` |
| Monorepo | Bun workspaces | root |
| AI | provider-agnostic layer, OpenAI-compatible HTTP; `zai` / `openai` / `mock` | `apps/api/src/ai` |

## Status right now

**Backend: complete and tested (39 tests, all green).** Clients CRUD, program
versioning, logging, history aggregation, exercise catalog (719 seeded from WGER),
and the full AI pipeline (generate → validate → approve) covered end-to-end by
keyless integration tests via the mock provider.

**Frontend: placeholder dashboard only.** The trainer UI is the remaining MVP work —
see the [roadmap](roadmap.md).

## How to run it

```bash
bun install
bun run db:up          # Postgres on :5433 (Docker)
bun run db:migrate
bun run seed:exercises # 719 exercises from WGER (idempotent)
cp .env.example .env   # add ZAI_API_KEY when you want real generation (free tier)
bun run dev            # API :4000 + web :5173
bun test               # all 39 tests (e2e skip if DB is down)
```

## Hard constraints (don't break these)

1. **AI output is advisory.** It becomes a *draft* program only after trainer approval,
   and client-visible only after explicit activation.
2. **Client limitations are hard constraints** — they reach every AI prompt verbatim.
3. **Everything validated at the boundary.** Every program/log/AI-draft write passes
   through the shared zod schemas. Invalid data never reaches the DB.
4. **Single source of truth.** Domain shapes live in `packages/shared` only — never
   redefined in the app or API.
