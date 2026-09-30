# Domain Model

All shapes are defined once in `packages/shared/src/domain.ts` (zod) — this doc
explains them; the code is authoritative.

## Entity overview

```
trainers ──< clients ──< programs >────── (self-ref: created_from_program_id)
    │           │             │
    │           │             └── sessions (jsonb document, schema-validated)
    │           │                    └── exercises[] ──▶ exercises.id
    │           ├──< session_logs ──< set_logs ──▶ exercises.id
    │           └──< ai_generations (audit: draft + status trail)
    ├──< exercises (trainer_id = custom exercises; NULL = global seed)
    ├──< prompt_templates        (planned — Phase L2)
    └──< periodization_schemes   (planned — Phase L2)

signal_snoozes / signal_outbox (planned — L2/L5, see notifications.md)
```

## Programs — the document structure

A program's `sessions` column is one jsonb array matching `ProgramSession[]`:

```jsonc
[
  {
    "id": "…uuid",            // stable id — set_logs.programExerciseId points HERE
    "name": "Day A — Lower",
    "order": 0,
    "notes": "stop 2 reps shy of failure on the last set",
    "exercises": [
      {
        "id": "…uuid",        // programExercise id (see above)
        "exerciseId": "…uuid",// reference into the exercises table
        "order": 0,
        "notes": "2s pause at bottom",
        "prescribedSets": [
          { "setNumber": 1, "type": "warm_up", "reps": 5, "amrap": false, "restSeconds": 90 },
          { "setNumber": 2, "type": "working", "reps": 5, "amrap": true, "targetRpe": 9, "restSeconds": 180 }
        ]
      }
    ],
    "conditioning": { "label": "Cardio VO2max", "detail": "intervals 1 : 3–5, 20–30 min" }
  }
]
```

Rules enforced by zod at every write:
- 1–14 sessions, 1–20 exercises per session, 1–20 prescribed sets per exercise.
- `reps` always present (0–100). `amrap: true` means reps is the *minimum*.
- `targetRpe` / logged `rpe` ∈ 1–10. `weightKg` ∈ 0–600.
- Set types: `warm_up | working | backoff`.

**Coach-format prescriptions** (beyond plain fixed reps — all optional, shared zod):

| Kind | Fields | Display |
|---|---|---|
| fixed reps | `reps` | `5` |
| rep range | `repsMin` + `reps` (upper bound) | `6–10` |
| timed | `durationSeconds`, `reps: 0` | `45s`, `1:00` |
| failure / AMRAP | `amrap: true`, `reps: 0` | `max` |
| load target | `targetWeightKg` (null = RPE-autoregulated) | `65kg × 5 @8` |
- `conditioning {label, detail}` per session: cardio prescription, display-only in MVP
  (not logged). Set-count ranges ("1–2 sets") map to the upper bound by convention.

One-click logging prefers `targetWeightKg` over last-logged when both exist.

### Program lifecycle

```
draft ──activate──▶ active ──activate-new──▶ archived
  ▲                    │
  └──── edit (PUT) bumps version
```

- Exactly **zero or one** `active` program per client: activating archives the
  client's other active programs (API enforces).
- **First activation stamps `activatedAt`** — the basis for block-week math
  (`floor((today − activatedAt)/7) + 1`). Derived, never stored per week.
- Editing an active program (`PUT /v1/programs/:id`) replaces the sessions document
  and bumps `version` (history of past versions = archived copies, by convention).
- `aiAssisted: true` + `createdFromProgramId` record AI provenance.

## Logging

Logged by the **trainer** in MVP (no client portal):

- `session_logs`: one per workout — client, program, optional link to the prescribed
  session, date (YYYY-MM-DD), notes, optional `perceivedEnergy` (1–10).
- `set_logs`: one row per set — links to `sessionLogId` + `exerciseId`, optionally
  to `programExerciseId` (which prescribed slot it filled; null = ad-hoc set),
  weight/reps/rpe/type.

## History aggregation (AI input + trainer view)

`buildHistory()` (apps/api/src/lib/history.ts) groups the last 8 weeks of *working*
sets per exercise and computes, per exercise:

- `recentSets`: human-readable strings, oldest → newest, e.g. `"100kg × 5 @ RPE 8"`
- `bestE1rm`: best Epley estimate in the window — `w × (1 + min(reps,12)/30)`,
  capped at 12 reps because beyond that the formula inflates.

## Periodization — phasing & the week scheme

`programs.phasing` (optional, nullable):

```jsonc
{
  "plannedWeeks": 6,
  "phase": "sarcoplasmic hypertrophy",
  "nextPhase": "strength interlude",
  "deloadWeeks": [6],
  "weeks": [                       // the progression scheme — optional
    { "week": 1, "directive": "base" },
    { "week": 2, "directive": "+volume" },
    { "week": 3, "directive": "+intensity" },
    { "week": 4, "directive": "+volume" },
    { "week": 5, "directive": "transition" },
    { "week": 6, "directive": "transition" }
  ]
}
```

Directives: `base | +volume | +intensity | deload | transition | test`. Block week
`= floor((today − activatedAt)/7) + 1` — derived, never stored.

**Progression scheme ≠ instruction template.** Different axes:

| | Instruction template | Progression scheme |
|---|---|---|
| Shape | freeform prose | structured week directives |
| Consumed by | the AI prompt (merged) | the **system** — signals, block pulse, AI context |
| Per program | N templates merged | exactly one scheme |
| Tells the model | *how* you want programs written | *what* each week should do |

Schemes live in a **trainer-owned library** (`PeriodizationSchemeDto { id, name,
weeks }` — mock: seeded "6-week wave (coach's own)", "4-week wave", "3:1 block"; builder
supports custom per-week editing + save/delete). Real system: `periodization_schemes`
table + `GET/POST/DELETE /v1/schemes` (mock ↔ real adapter already wired).

Delete every template and the scheme still drives all analytics; delete the scheme and
the AI still gets the prose. They cooperate once: generate flow (scheme = context,
templates = method notes).

## Block pulse — weekly volume & intensity

`blockPulse(program, logs)` (mock: `apps/web/src/lib/metrics.ts`, pure) computes per
block week from logged **working** sets:

- **Volume**: tonnage `Σ(kg × reps)` + set and rep counts (bodyweight sets count in
  sets/reps, not tonnage)
- **Intensity**: avg RPE, best e1RM (Epley, capped at 12 reps — matches history)
- **Deltas**: % change vs the previous logged week
- Weeks before `activatedAt` are excluded; unlogged weeks render as planned-only

`pulseSummary()` distills the series into one evidence/context line:
`weekly tonnage 1.8t → 2.3t (+28%) · best e1RM 77 → 84`.

## Exercise library

- Global seed: 719 exercises imported from WGER (CC-BY-SA, `trainerId = null`).
- Custom: trainer-created (`trainerId` set). AI drafts that name unknown exercises
  auto-create customs on approval (primary muscle defaults `full_body`, trainer
  recategorizes later).
- `primaryMuscleGroup` / `secondaryMuscleGroups` (max 4) from a fixed enum:
  chest, back, shoulders, biceps, triceps, forearms, quads, hamstrings, glutes,
  calves, core, traps, cardio, full_body.
- `equipment`: barbell, dumbbell, machine, cable, bodyweight, kettlebell, band,
  plate_loaded, other.

## Client profile — the AI's steering wheel

`goals` (free text), `limitations` (free text, **hard constraints** in every AI
prompt), `daysPerWeek` (1–7; the AI must produce exactly this many sessions),
`trainingDays` (optional weekday ints 1=Mon…7=Sun — the client's real calendar; drives
the dashboard week strip and adherence expectations), `status` (active / paused /
archived).
