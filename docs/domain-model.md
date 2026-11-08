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
    │           ├──< ai_imports (paste notes: text, status, chunk progress, checked result)
    ├──< exercises (trainer_id = custom exercises; NULL = global seed)
    ├──< exercise_aliases (name as written → exercise; trainer_id NULL = global)
    ├──< prompt_templates        (planned — Phase L2)
    └──< periodization_schemes   (planned — Phase L2)

signal_snoozes / signal_outbox (planned — L2/L5, see notifications.md)
```

## Programs — the document structure

A program stores a `ProgramWeeksDocument` (`weeks: ProgramWeek[]`):

```jsonc
[
  {
    "week": 1,
    "days": [
      {
        "id": "…uuid",
        "day": 1,               // ordinal day within the week
        "weekday": 1,           // optional weekday (1=Mon…7=Sun)
        "sessions": [
          {
            "id": "…uuid",      // stable session id
            "name": "Day A — Lower",
            "order": 0,
            "kind": "lifting",  // "lifting" | "cardio"
            "notes": "stop 2 reps shy of failure on the last set",
            "exercises": [
              {
                "id": "…uuid",        // programExercise id — set_logs.programExerciseId points HERE
                "exerciseId": "…uuid",// reference into the exercises table
                "order": 0,
                "notes": "2s pause at bottom",
                "prescribedSets": [
                  { "setNumber": 1, "type": "working", "reps": 5, "amrap": false, "targetRpe": 8, "restSeconds": 90 }
                ]
              }
            ]
          },
          {
            "id": "…uuid",
            "name": "Cardio 1",
            "order": 1,
            "kind": "cardio",
            "cardio": {
              "modality": "Bike",
              "durationMin": 30,
              "hrZone": 2
            },
            "exercises": []
          }
        ]
      }
    ]
  }
]
```

Rules enforced by zod at every write:
- 1–26 contiguous weeks, 1–7 days per week, 1–4 sessions per day, 1–20 exercises per lifting session, 1–20 prescribed sets per exercise.
- `kind: "lifting"` requires ≥1 exercise and no cardio prescription.
- `kind: "cardio"` requires cardio prescription and 0 exercises.
- `reps` always present on lifting sets. `amrap: true` means reps is the *minimum*.
- `targetRpe` / logged `rpe` ∈ 1–10. `weightKg` ∈ 0–600.
- Set types: `working | backoff`.

**Coach-format prescriptions** (beyond plain fixed reps — all optional, shared zod):

| Kind | Fields | Display |
|---|---|---|
| fixed reps | `reps` | `5` |
| rep range | `repsMin` + `reps` (upper bound) | `6–10` |
| timed | `durationSeconds`, `reps: 0` | `45s`, `1:00` |
| failure / AMRAP | `amrap: true`, `reps: 0` | `max` |
| load target | `targetWeightKg` (null = RPE-autoregulated) | `65kg × 5 @8` |
- Cardio prescription (`CardioPrescription`): `modality` (required), optional `durationMin`, `hrZone` (1–5), `intensity`, `distanceKm`, `targetRpe`.

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
- **Standing direction (`direction`)**: optional block-scoped steer (≤500 chars), editable
  via `PATCH /v1/programs/:id/direction` without bumping `version`. Directs every weekly AI generation.
- **Weekly re-draft**: approving a week-kind generation replaces week N+1 in place
  inside the `sessions` jsonb (`version++`, fresh ids, weekdays carried over; other weeks untouched).
- `aiAssisted: true` + `createdFromProgramId` record AI provenance.

## Logging

Logged by the **trainer** in MVP (no client portal):

- `session_logs`: one per workout — client, program, optional link to the prescribed
  session, date (YYYY-MM-DD), `kind` (`lifting` default | `cardio`), notes, optional
  `perceivedEnergy` (1–10). A cardio row carries its actuals in `cardio`
  (`modality`, optional `durationMin`/`hrZone`/`intensity`/`distanceKm`/`rpe`) and no
  sets; a date can hold both a lifting and a cardio row.
- `set_logs`: one row per set — links to `sessionLogId` + `exerciseId`, optionally
  to `programExerciseId` (which prescribed slot it filled; null = ad-hoc set),
  weight/reps/rpe/type. Cardio logs never have rows here.

Adherence counts **lifting** logs only — cardio progress has its own target/signal path.

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

- **Volume**: overall volume `Σ(kg × reps)` + set and rep counts (bodyweight sets count in
  sets/reps, not overall volume)
- **Intensity**: avg RPE, best e1RM (Epley, capped at 12 reps — matches history)
- **Deltas**: % change vs the previous logged week (`overallVolumeDelta`, `repsDelta`, `e1rmDelta`)
- **Targets**: `WeekTarget { metric, deltaPercent }` with `targetDelta` and `targetMet` evaluated
- Weeks before `activatedAt` are excluded; unlogged weeks render as planned-only

`pulseSummary()` distills the series into one evidence/context line:
`weekly overall volume 1.8t → 2.3t (+28%) · best e1RM 77 → 84`.

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

## Kinetic chains (myofascial slings)

The trainer organizes anatomy into five kinetic chains (myofascial slings):
1. **Intrinsic** (seed: core, back, traps)
2. **Deep Longitudinal** (seed: back, hamstrings, calves)
3. **Lateral** (seed: core, glutes, quads)
4. **Posterior Spiral** (seed: glutes, back, hamstrings)
5. **Anterior Spiral** (seed: core, quads, chest)

Each chain is a trainer-maintained set of muscle groups stored in the `kinetic_chains`
table (lazily seeded with defaults, editable at `/settings`). Selectable muscle groups
are `CHAIN_MUSCLE_GROUPS` (the 12 anatomical groups from `MUSCLE_GROUPS`, excluding
`cardio` and `full_body`).

### Exercise inheritance rule

Exercises do not carry manual chain tags. Instead, an exercise inherits chain
membership through its muscle groups:
$$\text{exercise groups} = \{\text{primaryMuscleGroup}\} \cup \text{secondaryMuscleGroups}$$
An exercise hits a chain iff $\text{exercise groups} \cap \text{chain.muscleGroups} \neq \emptyset$.
A working set counts toward **every** overlapping chain (membership sets, not a
partition).

### Weekly volume & AI balance

- **Chains trained this week**: `GET /v1/chains/week` calculates working-set volume
  per chain for the current ISO week (Mon-start) and displays on the client's Pulse tab.
- **AI generation & revision context**: `chainBalanceText` summarizes working sets per
  chain over the 8-week history window (e.g. `Intrinsic 5 · Deep Longitudinal 31 · Lateral 0 working sets · untrained: Lateral`),
  directing AI volume distribution across neglected chains.

## Client profile — the AI's steering wheel

`goals` (free text), `limitations` (free text, **hard constraints** in every AI
prompt), `daysPerWeek` (1–7; the AI must produce exactly this many sessions),
`trainingDays` (optional weekday ints 1=Mon…7=Sun — the client's real calendar; drives
the dashboard week strip and adherence expectations), `status` (active / paused /
archived).

## Weekly cardio target

`clients.cardioTarget` `{unit, value}` — a standing per-client weekly target, reset
every ISO calendar week (Monday-start, same window as the chains week and the
overview grid). Progress is computed on read by the shared pure functions
(`cardioWeekTotals` / `cardioDone` in `packages/shared/src/cardio.ts`):

- `minutes` = Σ `durationMin` of the week's cardio logs
- `sessions` = count of cardio logs
- `zone_minutes` = Σ `durationMin` × `hrZone` (missing zone → ×1)

A `cardio-behind` signal (shared `cardioBehindSignal`) fires when a client with a
target is under 60% of pro-rata pace (`0.6 × value × weekday/7`) on Thursday or later.
The AI prompt carries the target so drafts prescribe cardio consistent with it.

## Paste import and exercise aliases

A trainer's plain-text program becomes a draft through `ai_imports` (migration 0039). The row keeps the pasted `text`, the provider/model/effort, `status` (`pending · done · failed · cancelled`), `chunks_total` / `chunks_done`, and the checked `result` (`ImportResult`, `packages/shared/src/import.ts`). Nothing is created from it directly: "Use this" fills the new-program form, and the trainer saves a normal draft program.

The LLM output (`ImportChunk`) is checked in code before anyone sees it. Every number in a prescription or in the logged actuals has to be on its source line (1 min may justify 60 s; a pyramid's set count is its list length); a number inside the exercise name can't be reps, sets or load, and one occurrence can't fill two prescription fields. Values outside plausible ranges, lines nothing used, and exercises with no prescription are flagged amber. Ranges the program model can't hold (`1-2 sets`, `10-15 sec`, `Zone 2-3`, `40-60 min`) use the upper value and keep the wording in the exercise note (or cardio intensity). Mapping onto `PrescribedSet`: `6-10` → `reps 10, repsMin 6`; `10/8/6/5` → one set per value; timed → `durationSeconds` with `reps 0`; failure → `amrap` with `reps 0`; rounds and steps → `reps` with the unit in the note. The UI says "values found in your text", never "verified".

Weeks are grouped into blocks when consecutive weeks share exercise names (Jaccard ≥ 0.6 after normalizing); the latest block is the default and its latest week is the template.

`exercise_aliases` maps a name as a trainer writes it (normalized: lowercase, no punctuation, single spaces) to one exercise. `trainer_id` NULL means global, set means personal — the same scoping as `exercises`; personal wins over global. One alias per trainer (global included): `UNIQUE NULLS NOT DISTINCT (trainer_id, alias)` (Postgres ≥ 15). Matching order for an imported exercise: alias → exact catalog name (also equal up to case, punctuation and shorthand: "Pull up" = "Pull-Up") → fuzzy (shorthand like BB/DB/KB/SA/OVH expanded, typo-tolerant tokens, top 3 offered) → new custom exercise. Fuzzy matches are accepted by default; on "Use this" every fuzzy match left standing and every match the trainer changed is saved as a personal alias (`source: import`).

