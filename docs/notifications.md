# Notifications & phase-change signals — real-system design

How the system knows a client's program should change phase (periodization) and how the
trainer gets reminded. Mock implementation lives in `apps/web/src/lib/signals.ts`; this
document is the contract for the real system.

## Core decisions

1. **Signals are derived state, never stored as truth.** A signal is a pure function of
   `(program.phasing, program.activatedAt, session logs, today)`. Computed on demand by a
   shared rule engine. Nothing can drift out of sync because there is no second copy.
2. **Expected block end is computed, not stored.** `activated_at + plannedWeeks * 7`.
   Extending a block = edit phasing; no separate date to forget.
3. **One rule engine, three trigger paths.** Rules live in `packages/shared`
   (`computeSignals(program, logs, today)`); UI read-path, log-write hook, and daily cron
   all call the same functions.
4. **Signals are advisory.** Every signal shows its evidence and offers snooze. Trainer
   decides (liability framing from `docs/ai-integration.md`).

## Inputs

| Input | Source | Notes |
|---|---|---|
| Logs | `session_logs`, `logged_sets` | normalized tables, already exist |
| Program + previous blocks | `programs` (versioned jsonb, `created_from_program_id`) | already exists |
| Phasing plan | `programs.phasing` jsonb: `{plannedWeeks, phase, nextPhase, deloadWeeks}` + `activated_at` column | small migration |

## Rule set (v1)

| Signal | Kind | Trigger | Meaning |
|---|---|---|---|
| Block ending | `block-ending` | `week >= plannedWeeks - 1` | draft next block now |
| Deload week | `deload-week` | `week ∈ deloadWeeks` | planned light week |
| RPE creep | `rpe-creep` | same load, avg RPE +≥1.5 vs first week | fatigue building |
| Stall | `stall` | weekly best e1RM peaked ≥3 weeks ago, last weeks within +1% | stimulus exhausted |
| Adherence | `adherence` | <60% planned sessions logged (suppressed near block end) | program isn't being run |

`week = floor((today − activated_at) / 7) + 1`. e1RM = Epley capped at 12 reps (matches
history aggregation).

## Trigger paths

### 1. Read path (in-app, no scheduler)

`GET /v1/notifications` → load trainer's active programs + logs → `computeSignals` per
program → filter snoozed → return. Powers dashboard "Needs review" and client banner.

### 2. Write path (event-driven, no polling)

Data-driven signals (rpe-creep, stall) can only change when a log lands. In
`POST /v1/logs/sessions`, after commit: run rules for that program; any signal id absent
from `signal_outbox` → insert (dedupe) → background worker sends email.

### 3. Clock path (daily cron)

Calendar rules (block-ending, deload-week, adherence silence) need a timer:

```sql
SELECT cron.schedule('phase-check', '0 6 * * *', $$
  INSERT INTO signal_outbox (signal_id, kind, payload, created_at)
  SELECT p.id || ':block-ending', 'block-ending', jsonb_build_object(...)
  FROM programs p
  WHERE p.status = 'active'
    AND (current_date - p.activated_at::date) / 7 + 1
        >= (p.phasing->>'plannedWeeks')::int - 1
  ON CONFLICT (signal_id) DO NOTHING
$$);
```

Alternative to pg_cron: node-cron / systemd timer hitting an internal endpoint that runs
the shared TS rules directly (preferable if rules get complex — keeps SQL dumb).

## New storage (whole addition)

```sql
signal_snoozes (
  signal_id  text,
  trainer_id uuid,
  snoozed_until timestamptz,
  PRIMARY KEY (signal_id, trainer_id)
)

signal_outbox (
  signal_id  text PRIMARY KEY,   -- deterministic: "block-ending:<programId>"
  kind       text,
  payload    jsonb,
  status     text DEFAULT 'pending',  -- pending | sent | failed
  sent_at    timestamptz
)
```

Signal ids are deterministic functions of their condition — that is what makes dedupe a
primary-key conflict instead of a matching problem. A new occurrence after a block change
produces a new id automatically.

## Not in v1 (recorded, not built)

- Push (mobile/web) delivery — email first
- Per-exercise e1RM sparkline embedded in notification payload
- Client-facing check-in prompts for adherence (client portal doesn't exist in MVP)
- Multi-tenant partitioning of the cron (single-trainer MVP)

## Mock ↔ real parity

Mock `apps/web/src/lib/signals.ts` is deliberately written as the same pure functions with
the same signal ids and the same thresholds. Moving to real = copy file to
`packages/shared`, swap `localStorage` snooze for the snooze table. The generate-flow
handoff (`?tpl=&note=` prefill) is unchanged.
