# Roadmap

## Phase 0 — Foundation (✅ DONE, 2026-09-22)

- [x] Monorepo: Bun workspaces, `apps/web` (SvelteKit 5), `apps/api` (Elysia),
      `packages/shared` (zod contracts), `packages/db` (Drizzle + Postgres 17)
- [x] Domain model + validation gate with 14 schema tests
- [x] DB schema + migration; programs as versioned jsonb documents, logs normalized
- [x] Clients / programs API (versioning, activation auto-archive, 422 on invalid docs)
- [x] Exercise catalog: WGER import script + 719 seeded exercises
- [x] Logging API + 8-week history aggregation (shared with AI context)
- [x] AI pipeline: generate → JSON-mode call → zod gate (1 retry) → audit trail →
      approve/reject; provider registry (zai / openai / mock)
- [x] Keyless e2e tests of the full loop via mock provider — 39 tests green

## Phases 1–4 — Trainer UI (✅ DONE as mocked demo, 2026-09-22)

The full trainer UI exists and demos the entire loop end-to-end on in-memory fixtures
(`PUBLIC_API_MODE=mock`, default — no backend, no keys, no Docker). Everything below is
delivered and verified in the mock:

- **Phase 1 — Clients:** list (search, status badges, training days, current program),
  create/edit (goals, limitations as AI hard constraints, days/week, training days),
  client detail (current program, per-exercise history, past programs, block pulse,
  phase signals with snooze)
- **Phase 2 — Programs:** scratch builder (sessions → exercises → per-set prescriptions
  incl. rep ranges, timed sets, failure sets, load targets, conditioning; progression
  scheme picker), editor (set editing, exercise swap, deload −10%, editable conditioning),
  version bump on save, activate/archive lifecycle
- **Phase 3 — Logging:** pick client + prescribed session → prefilled (prescription over
  last-logged), fast per-set entry, one-click session logging, notes + energy, inline history
- **Phase 4 — AI flow:** generate page (provider picker, instruction templates, one-off
  note, auto-injected periodization context), draft review with diff vs current program,
  approve → draft program, reject with audit trail preserved
- **Extras shipped alongside:** dashboard needs-review signals + this-week strip,
  instruction-template CRUD (`/templates`), progression-scheme library (seeded + custom
  builder + save/delete), exercise library page

**What "mocked" means:** the web app talks to `mockApi` behind the `TrainerApi` interface
(same DTOs as `realApi`). Signals/metrics/pulse are pure frontend modules. The backend's
zod schema and endpoints do not yet know about these features — that is Phase L.

## Delivered in mock — needs live wiring

### Periodization schemes & block pulse

Trainer's week-by-week guide (`base → +volume → +intensity → +volume → transition →
transition`) is modeled as `phasing.weeks` directives, with a trainer-owned scheme
library (`PeriodizationSchemeDto`). `apps/web/src/lib/metrics.ts` computes weekly
tonnage / sets / avg RPE / best e1RM from logged working sets (pure functions). Off-plan
signals compare directive vs measured week. Live wiring: L1 (schema) + L3 (move modules
to shared). Later refinements: dedicated `/schemes` manage page, volume/intensity
charts, ACWR fatigue ratio, cardio volume, per-exercise pulse drills.

### Periodization signals

Phase-change nudges computed on read from (program.phasing, session logs): block-ending,
deload-week, transition-due, off-plan (volume/intensity/fatigue), RPE-creep, stall,
adherence. Rules live in `apps/web/src/lib/signals.ts` as pure functions — L3 moves them
to `packages/shared` so the API runs them identically in `GET /v1/notifications`.
Snooze = localStorage in mock; real: `signal_snoozes` table. Full design:
**docs/notifications.md**.

### Instruction templates

Reusable standing rules for AI generations (RPE caps, block conventions, equipment
constraints). Mock: in-memory CRUD at `/templates`. Real backend: `prompt_templates`
table + `GET/POST/PUT/DELETE /v1/ai/prompt-templates`; web `real.ts` already points
there. Later: per-client standing additions, template usage recorded per draft.

## Phase L — go live (`PUBLIC_API_MODE=live`) — ✅ DONE, 2026-09-30

Ordered workstreams; each is independently shippable. Contract details live in
[api.md](api.md) + [domain-model.md](domain-model.md); design rationale in
[notifications.md](notifications.md) / [ai-integration.md](ai-integration.md).
L3 ran before L2 (the notifications endpoint consumes the shared engine); the Eden
Treaty client (D1) replaced the hand-written fetch inside the `TrainerApi` seam.

### L1 — Contract extensions (packages/shared + packages/db)

- [x] `packages/shared/src/domain.ts`: prescribed sets gain optional `targetWeightKg`
      (load targets), `repsMin` (rep ranges, e.g. 6–10), `durationSeconds` (timed sets —
      `amrap` with `reps: 0` = failure); sessions gain `conditioning {label, detail}`;
      programs gain `phasing {plannedWeeks, phase, nextPhase, deloadWeeks, weeks?}` +
      `activatedAt` (stamped on first activation); clients gain `trainingDays`
      (weekday ints 1=Mon…7=Sun)
- [x] `packages/db`: drizzle migration for the new columns (`training_days`,
      `activated_at`, `phasing`; set fields ride the sessions jsonb)
- [x] Schema tests updated; `bun test` green
- **Acceptance:** the exact DTOs `apps/web/src/lib/api/types.ts` describes all parse
  through shared zod; old data still validates.

### L2 — New endpoints (apps/api)

- [x] `prompt_templates` table + `/v1/ai/prompt-templates` CRUD (real.ts contract)
- [x] `periodization_schemes` table + `/v1/schemes` CRUD
- [x] `GET /v1/notifications` (signals computed on read via L3 engine) + snooze
      (`PUT /v1/notifications/:signalId/snooze` → `signal_snoozes` table)
- [x] Program POST/PUT persist `phasing`; activation stamps `activated_at` (first only)
- [x] Client PATCH accepts `trainingDays`; logs write hook queues signals into
      `signal_outbox` post-commit (dedupe by signal id; email consumer is L5)
- **Acceptance:** every path `real.ts` calls exists with matching shapes (parity table
  in api.md); e2e tests per endpoint. Bonus: generate now persists `failed_provider`
      instead of leaving the audit row `pending` forever.

### L3 — Rule engine to shared (packages/shared)

- [x] Move `apps/web/src/lib/signals.ts` + `lib/metrics.ts` → `packages/shared`
      (same ids, same thresholds; only snooze source differs — localStorage in mock,
      `signal_snoozes` via the API in live)
- [x] Web imports from shared; API uses them for `GET /v1/notifications` and the
      log write hook (`apps/api/src/lib/signals-service.ts`)
- **Acceptance:** mock-mode UI behavior unchanged; API returns the same signals the
  mock dashboard showed for the same data. Signals carry `programId`/`clientId`.

### L4 — Web live flip (apps/web)

- [x] `PUBLIC_API_MODE=live` smoke pass on every screen against real backend
      (full trainer loop verified in the browser: client with weekday picker →
      program with scheme → activate → one-click log → pulse/signals → AI draft
      with periodization context → approve → activate, auto-archive previous block)
- [x] Eden Treaty inside the `TrainerApi` seam replaces the hand-written fetch client
      (AGENTS.md rule satisfied; mock demo mode preserved; `unwrap` converts Eden's
      revived Dates back to ISO strings so DTOs hold in both modes)
- [x] Real-mode prompt: AI drafts propose `phasing` (incl. week directives) and
      `targetWeightKg` progressing from last logged loads; periodization context
      auto-injected into the prompt
- [x] Exercise substitution parity (editor swap rides PUT sessions — verified)
- [ ] Demo data behind env flag for seed parity (`SEED_DEMO`, optional — not built)
- **Acceptance:** full loop — client → program (scheme) → log → pulse/signals →
  AI draft with periodization context → approve → activate — in live mode, zero mock
  imports. Smoke pass fixed real bugs: builder emitted non-uuid ids and empty
  sessions (both rejected by the live zod gate), Eden Date revival broke
  string-typed date fields, mode flag now read via `$env/static/public`.

### L5 — Delivery & scheduling (optional, post-flip)

- [ ] `@elysiajs/cron` daily 06:00 scan + boot catch-up; `signal_outbox` dedupe
- [ ] Email dispatch (see notifications.md; Redis locks only if >1 replica)
- **Acceptance:** snoozed-away signal produces no duplicate email; restart mid-scan
  harmless.

## Phase 5 — Real-world hardening (post-MVP)

- [ ] Real Z.ai key e2e run (prompt quality check on actual GLM-4.5-Flash output)
- [ ] Deploy (single VPS + Docker Compose; API + web + Postgres), backups
- [ ] Error monitoring, request logging, rate limits
- [ ] Prompt tuning from real trainer feedback (progression conservatism etc.)

## Deferred (explicitly NOT in MVP)

| Feature | Why deferred | Re-entry cost |
|---|---|---|
| Client portal (self-logging, program view) | cut 2026-09-22; trainer runs the loop | low — log tables already normalized |
| Trainer auth / multi-tenant | single user for now | medium — schema ready (`trainer_id` everywhere), needs session auth |
| Offline PWA logging | no client portal → nothing to sync yet | medium |
| Payments, scheduling/calendar, messaging, nutrition, video analysis, wearables | out of core loop | — |

## Open decisions

1. **Freestyle logging:** should trainers be able to log a session with *no* program
   (vacation workout, drop-in)? Schema supports it (`programId` is required today —
   would need nullability). Decide during L4 live-mode pass.
2. **Auto-create custom exercises on approve** (current behavior) vs forcing manual
   mapping in the review UI. Revisit during L4 usability pass.
3. **Program version history UI:** archived copies exist by convention; do we surface
   a proper diff/history view or keep it minimal?
