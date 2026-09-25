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

## Phase 1 — Trainer UI: clients (next up)

> **Status note 2026-09-22:** full trainer UI exists as a **mocked demo** (`PUBLIC_API_MODE=mock`,
> default): all screens — overview, clients, client detail, log entry, AI generate/review/approve,
> program editor, exercise library — run on in-memory fixtures, no backend needed. Built for
> stakeholder alignment; phases 1–4 below now describe wiring these screens to `realApi`
> `PUBLIC_API_MODE=live` flip needs these contract additions: prescribed sets gain optional `targetWeightKg` (load targets) + `repsMin` (rep ranges, e.g. 6–10) + `durationSeconds` (timed sets — stretches, planks, swings; amrap with reps 0 = failure), sessions gain `conditioning {label, detail}` (zone/interval cardio blocks), clients gain `trainingDays` (weekday ints, 1=Mon…7=Sun — powers the dashboard week strip and honest adherence), program editing needs exercise substitution (currently UI-only swap), and the zod program schema must accept `phasing` (incl. `weeks` directives — powers scheme signals + block pulse) + `activatedAt`.

Full real-system design: **docs/notifications.md**.

### Periodization schemes & block pulse (mocked now)

Trainer's week-by-week guide (`base → +volume → +intensity → +volume → transition →
transition`) is modeled as `phasing.weeks` directives. `lib/metrics.ts` computes weekly
tonnage / sets / avg RPE / best e1RM from logged working sets (pure functions — move to
`packages/shared` with the signals). Off-plan signals compare directive vs measured week.
Later: **scheme library CRUD** (trainer saves his own waves — 6-week, 4-week, 3:1 —
reusable like `/templates`; presets are currently hardcoded in the builder),
volume/intensity charts, ACWR fatigue ratio, cardio volume, per-exercise pulse drills.

### Periodization signals (mocked now)

Phase-change nudges computed on read from (program.phasing, session logs): block-ending,
deload-week, RPE-creep, stall, adherence. Rules live in `apps/web/src/lib/signals.ts` as
pure functions — **move to `packages/shared`** so the API can run them identically in
`GET /v1/notifications`. Snooze = localStorage in mock; real API: small `signal_snoozes`
table. Programs gain optional `phasing` metadata (plannedWeeks, phase, nextPhase,
deloadWeeks) — AI drafts should propose it too (prompt update when wiring live).
Refinement candidates: per-exercise e1RM trend charts in the evidence, email/push
delivery, client check-in messages for adherence.

### Instruction templates (mocked now)
Reusable standing rules for AI generations (RPE caps, block conventions, equipment
constraints). Mock: in-memory CRUD. Real backend later: `prompt_templates` table
(trainer_id, name, content, timestamps) + `GET/POST/DELETE /v1/ai/prompt-templates`;
web `real.ts` already points there. Later refinements: per-client standing additions
auto-prepended to every generation, and template usage recorded on each draft for
auditing.

- [ ] Clients list (status badges, days/week, current program name)
- [ ] Create/edit client form — goals, limitations (marked as AI hard constraints),
      days per week
- [ ] Client detail: current program summary, per-exercise history (`GET /v1/logs/history`),
      past programs with status
- **Acceptance:** trainer can fully manage clients and see a client's history without
  touching curl.

## Phase 2 — Trainer UI: program builder

- [ ] Program list per client (draft/active/archived, version, AI-assisted badge)
- [ ] Builder: sessions → exercises (typeahead over catalog + customs, searchable
      by muscle/equipment) → prescribed sets (reps, amrap, target RPE, rest, type)
- [ ] Edit active program (version bump), activate/archive
- [ ] Create custom exercises inline
- **Acceptance:** trainer can build and activate a full program without curl; invalid
  states can't be submitted (client-side mirrors of the zod rules).

## Phase 3 — Trainer UI: log entry

- [ ] Pick client + prescribed session → form pre-filled with the prescribed sets
- [ ] Fast tab-through entry: weight / reps / RPE per set; add ad-hoc sets
- [ ] Session notes + perceived energy
- [ ] Recent history shown inline while logging
- **Acceptance:** logging a completed session takes <60 seconds for a typical workout.

## Phase 4 — Trainer UI: AI generation flow (the headline)

- [ ] "Generate next block" on client detail: provider picker (only configured ones
      enabled), optional free-text instructions, optional base program
- [ ] Generation states: pending → validated / failed (error surfaced)
- [ ] Draft review: rationale, client summary, sessions/set-by-set, **diff vs current
      program** (added/removed exercises, set/rep changes)
- [ ] Approve → opens the new draft program in the builder (Phase 2) for edits
- [ ] Reject with the audit trail preserved
- **Acceptance:** full loop — client → program → logs → AI draft → approve → activate —
  works entirely in the UI, zero curl.

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
   would need nullability). Decide when building Phase 3 UI.
2. **Auto-create custom exercises on approve** (current behavior) vs forcing manual
   mapping in the review UI. Revisit after Phase 4 usability pass.
3. **Program version history UI:** archived copies exist by convention; do we surface
   a proper diff/history view or keep it minimal?
