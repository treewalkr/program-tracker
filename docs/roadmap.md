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
