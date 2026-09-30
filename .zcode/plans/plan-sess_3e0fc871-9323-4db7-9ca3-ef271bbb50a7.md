# Implementation Plan — Phase L Go-Live (L1 → L3 → L2 → L4)

**Goal:** Take the app from "full trainer UI on an in-memory mock" to fully live: shared contracts extended, missing endpoints built, signal/metric engine moved to `packages/shared`, and the web flipped to `PUBLIC_API_MODE=live` with Eden Treaty as the transport inside the existing `TrainerApi` seam.

**Sequencing note:** Roadmap orders L2 before L3, but L2's `GET /v1/notifications` is defined as "signals computed on read via the L3 engine". We therefore do **L1 → L3 → L2 → L4**; each workstream still ships independently with green tests and its own commits.

**Out of scope (per decisions):** L5 cron/email (we create the `signal_outbox` table now but add no consumer), Phase 5 deploy/hardening, client portal, auth, freestyle logging (`session_logs.program_id` stays NOT NULL), open decisions #2/#3.

---

## Workstream A — L1: Contract extensions (`packages/shared` + `packages/db`)

**A1. Extend `packages/shared/src/domain.ts` to match the web DTOs exactly:**
- `PrescribedSet`: `reps` relax to `min(0)` (0 = not rep-based) with a refinement that `reps === 0` requires `amrap: true` or `durationSeconds`; add optional `repsMin` (int 0–100, ≤ `reps`), `durationSeconds` (int 1–3600, timed sets), `targetWeightKg` (0–600, nullable).
- `ProgramSession`: add optional `conditioning: { label, detail } | null`.
- New `WeekDirective` enum (`base | +volume | +intensity | deload | transition | test`), `WeekPlan { week, directive, note? }`, `Phasing { plannedWeeks (1–26), phase, nextPhase?, deloadWeeks: number[], weeks? }`; `Program` gains `phasing?: Phasing | null` and `activatedAt?: string | null`.
- `Client` gains `trainingDays?: number[]` (ints 1–7, ISO Mon=1, unique).
- Acceptance gate: every DTO shape in `apps/web/src/lib/api/types.ts` parses through shared zod; existing rows/fixtures (all `reps ≥ 1`, no new fields) still validate.

**A2. Drizzle migration (0001):** `clients.training_days` (jsonb int[], nullable), `programs.activated_at` (timestamptz, nullable), `programs.phasing` (jsonb `Phasing`, nullable). Set fields + conditioning ride the existing `sessions` jsonb — no columns.

**A3. Extend `packages/shared/src/domain.test.ts`:** rep ranges, timed/failure sets, `reps: 0` without amrap/duration rejected, phasing roundtrip, trainingDays validation, old-shape data parses. `bun test` green.

Commits: `extend shared domain contracts (coach formats, phasing, training days)` · `db: training_days, activated_at, phasing migration`.

---

## Workstream B — L3: Rule engine to shared (moved ahead of L2)

- Move `apps/web/src/lib/signals.ts` → `packages/shared/src/signals.ts` and `apps/web/src/lib/metrics.ts` → `packages/shared/src/signals` sibling `metrics.ts` — same signal ids, same thresholds; only the snooze source stays out of shared (pure compute functions take `(program, logs, client, today)`; Signal type must carry `clientId`/`programId` so the API can partition per client).
- The pure engine keeps its deterministic ids (`block-ending:<programId>`, `offplan-vol:<programId>:w3`, …) — required for `signal_snoozes`/outbox PK semantics.
- Web: update imports across pages (signals/metrics consumers: overview, client detail, generate, log); keep the localStorage snooze wrapper web-side for now.
- Verify mock-mode UI behavior is byte-identical (dashboard feed, client detail signal cards, block pulse table).

Commit: `move signals + metrics engine to @pt/shared`.

---

## Workstream C — L2: New endpoints (`apps/api`) + second migration

**C1. Migration (0002) — four tables:** `prompt_templates` (trainer_id FK, name, content, timestamps), `periodization_schemes` (trainer_id FK, name, `weeks` jsonb `WeekPlan[]`), `signal_snoozes` (PK `(signal_id, trainer_id)`, `snoozed_until`), `signal_outbox` (signal_id PK, kind, payload jsonb, status pending|sent|failed, sent_at — created now for L5, no consumer yet).

**C2. Shared input schemas:** `SchemeInput { name, weeks }`, `TemplateInput { name, content }`, plus the `Signal` output type shared by API + web.

**C3. Routes (follow existing Elysia patterns — consult the `/elysia` skill):**
- `routes/schemes.ts`: `GET /v1/schemes`, `POST /v1/schemes` (201 / 422 zod), `DELETE /v1/schemes/:id` (404). Deleting a scheme never touches programs — they carry their own `phasing` copy.
- `routes/prompt-templates.ts`: GET (returns `{ templates: [...] }` wrapper to match `real.ts`), POST → 201, PUT, DELETE.
- `routes/notifications.ts`: `GET /v1/notifications` — load trainer's clients + active programs (+ phasing/activatedAt) + session logs, run the shared engine, filter snoozed (`snoozed_until > now`), return `{ signals }`. `PUT /v1/notifications/:signalId/snooze { until }` — upsert into `signal_snoozes`.
- `routes/programs.ts`: POST/PUT accept + zod-validate `phasing` and persist it; `PATCH /status` stamps `activated_at = now()` on **first** activation only; serializers return `phasing` + `activatedAt`.
- `routes/clients.ts`: POST/PATCH accept `trainingDays`; serializers return it.
- `routes/logs.ts`: post-commit write hook — after a session-log insert, run the shared rules for that client and insert new signal ids into `signal_outbox` (`on conflict do nothing` dedupe).
- Minor fix en route: `POST /v1/ai/generate` currently returns 502 on `ProviderError` but leaves the audit row `pending` forever — persist `failed_provider` status.

**C4. e2e tests per endpoint** (extend `apps/api/src/e2e.test.ts`): schemes CRUD, templates CRUD, notifications read + snooze roundtrip, phasing persisted + activatedAt stamped once, trainingDays PATCH, outbox row inserted on log write. All existing 39 tests stay green.

Commits: one per route group + `db: prompt_templates, schemes, signal tables migration`.

---

## Workstream D — L4: Web live flip + Eden Treaty

**D1. Eden inside the seam (satisfies AGENTS.md, keeps mock mode):**
- `apps/api` exports its app type (`export type App = typeof app`) for treaty inference.
- `apps/web` gains `@elysiajs/eden` + a type-only dep on `@pt/api`; new `lib/api/treaty.ts` = `treaty<App>(PUBLIC_API_URL)`.
- Rewrite `real.ts` to implement `TrainerApi` by delegating to the treaty client — no hand-written fetch left; preserve error surfacing (`body.error`).
- De-duplicate types: `types.ts` DTOs become `z.infer` re-exports from `@pt/shared` (+ the `TrainerApi` interface stays). Delete the `real.ts:46` TODO.
- `TrainerApi` gains `notifications(): Promise<Signal[]>` + `snoozeSignal(id, until)` — real adapter hits the endpoints; mock adapter computes via the shared engine + keeps localStorage snooze. Pages get signals/snooze through the seam (one code path, two adapters). Block pulse stays computed client-side from shared `metrics` (it renders from already-loaded program+logs).

**D2. AI prompt + draft gate** (per `docs/ai-integration.md`): `AiProgramDraft` gains optional `phasing`; system prompt instructs drafts to propose `phasing` (weeks from the client's scheme) and `targetWeightKg` progressing from last logged loads (+2.5 kg grid default) with rationale citing logged numbers; user-message context gains the auto-injected read-only periodization block (from shared `blockPulse`/`pulseSummary`). `draftToProgram` passes `phasing` into the created program. Verify selected-template merging still happens web-side into `instructions`.

**D3. Small web gaps surfaced by live mode:** weekday picker for `trainingDays` in client create/edit (the overview week strip silently skips clients without it — live DB starts empty); demo banner reflects actual `PUBLIC_API_MODE`; replace hardcoded nav client count and "Coach Dara" identity with data; remove dead `Rpe.svelte`.

**D4. Live smoke pass (`PUBLIC_API_MODE=live`, Docker Postgres up, migrations applied):** every screen — overview, clients, client detail, generate (mock provider, keyless), log, program builder/editor, exercises, templates, schemes in builder. Verify exercise-substitution parity (editor swap via PUT sessions). **Acceptance:** full loop — client → program (scheme) → activate → log → pulse/signals → AI draft with periodization context → approve → activate — in live mode with zero mock imports. `svelte-check` + `bun test` green.

**D5. Optional (skip if time-boxed):** `SEED_DEMO` seed script for demo-data parity.

Commits: `eden treaty client inside the seam` · `signals + snooze through TrainerApi` · `training days picker + live-mode chrome` · `ai drafts propose phasing + load targets` · `docs: tick Phase L`.

**Final docs commit:** tick roadmap checkboxes for L1–L4, update README/PLAN "status right now", record the Eden-inside-the-seam decision in architecture.md.

---

## Verification & risks

- Every workstream ends with `bun test` green (39 existing + new) and, from D on, `svelte-check`; mock mode must stay functional after B and D1 (it's the keyless demo).
- Watch numeric serialization: postgres `numeric` comes back as strings — confirm `weightKg`/`rpe` conversions at the API boundary hold for the new endpoints (existing `buildHistory` pattern).
- Eden needs only a type-only import of `@pt/api` (SPA, `ssr=false`) — no runtime coupling.
- Consult `/elysia` and `svelte5-best-practices` skills when writing API/Svelte code per AGENTS.md; commits stay small, subject-only, no trailers.