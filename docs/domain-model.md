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
    └──< exercises (trainer_id = custom exercises; NULL = global seed)
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
    ]
  }
]
```

Rules enforced by zod at every write:
- 1–14 sessions, 1–20 exercises per session, 1–20 prescribed sets per exercise.
- `reps` always present (1–100). `amrap: true` means reps is the *minimum*.
- `targetRpe` / logged `rpe` ∈ 1–10. `weightKg` ∈ 0–600.
- Set types: `warm_up | working | backoff`.

### Program lifecycle

```
draft ──activate──▶ active ──activate-new──▶ archived
  ▲                    │
  └──── edit (PUT) bumps version
```

- Exactly **zero or one** `active` program per client: activating archives the
  client's other active programs (API enforces).
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
`status` (active / paused / archived).
