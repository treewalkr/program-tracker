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

### 3. Clock path (daily scheduled scan)

Calendar rules (block-ending, deload-week, adherence silence) need a timer.

**Recommended for this stack: `@elysiajs/cron` inside `apps/api`** (Elysia plugin wrapping
node-cron). The API is already a long-running process, so zero new infrastructure; the
job registers like any plugin (lifecycle-bound to the app instance); and the rules are
TypeScript in `packages/shared` — pg_cron would force duplicating them in SQL (drift) or
reduce the timer to a middleman that pokes the API anyway.

```ts
import cron from "@elysiajs/cron";
import { computeSignals } from "@pt/shared";

app.use(
  cron({
    name: "phase-check",
    pattern: "0 6 * * *", // daily 06:00
    run() { void runPhaseCheck(); },
  })
);
runPhaseCheck(); // boot catch-up — idempotent thanks to outbox dedupe
```

The scan is idempotent: `signal_outbox` dedupe (`signal_id` PK) makes double-runs
harmless, so boot-time catch-up covers restarts and downtime.

pg_cron alternative (runs SQL in Postgres directly) only wins when there is no always-on
app process or when many DB-side jobs exist — not the case here (also: not in the stock
`postgres:17` image).

**Horizontal scale (noted, not built):** with >1 API replica, every replica runs the
cron job and the log-write hook concurrently. The outbox `signal_id` PK already
collapses duplicate inserts, but *dispatch* needs coordination or trainers get duplicate
emails. Fix when needed: Redis lock — `SET phase-check:lock <runId> NX EX 600` per scan
run, or finer-grained `SET signal:<id>:sent 1 NX EX 86400` before each send; only the
lock winner dispatches. Redis over DB advisory locks because TTL auto-expires crashed
workers. Single-instance MVP ships none of this — just the outbox.

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
