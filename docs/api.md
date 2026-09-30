# API Reference

Base URL (dev): `http://localhost:4000` · All bodies are JSON.

## System

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ok, service, time}` |
| GET | `/v1/ai/providers` | provider registry; `configured: bool` per provider; **never returns API keys** |

## Clients

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/clients` | all clients of the (single) trainer |
| POST | `/v1/clients` | `{name, email, goals?, limitations?, daysPerWeek?, trainingDays?}` → 201 |
| GET | `/v1/clients/:id` | client + `currentProgram` + all their programs |
| PATCH | `/v1/clients/:id` | partial update of name/goals/limitations/daysPerWeek/trainingDays/status |

`trainingDays`: weekday ints 1=Mon…7=Sun (e.g. `[1,2,4,6]`) — powers the dashboard
week strip and honest adherence (expected sessions come from the *client's calendar*,
not the program's day count).

## Programs

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/programs?clientId=` | list (optionally filtered), newest first |
| POST | `/v1/programs` | `{name, clientId?, description?, sessions, phasing?, aiAssisted?, createdFromProgramId?}` — `sessions` must pass the `ProgramSession[]` zod schema or **422** |
| GET | `/v1/programs/:id` | one program |
| PUT | `/v1/programs/:id` | `{sessions}` (and optionally `phasing`) — replace document, **version++** |
| PATCH | `/v1/programs/:id/status` | `{status: draft\|active\|archived}` — activating archives the client's other active programs; **first activation stamps `activatedAt`** (basis for block week math) |

`phasing` (optional, object): `{plannedWeeks, phase, nextPhase?, deloadWeeks[], weeks?}`
where `weeks` is the periodization scheme — `{week, directive}` with directive one of
`base | +volume | +intensity | deload | transition | test`. See
[domain-model.md](domain-model.md) for semantics.

### Prescribed set schema (coach formats)

Every prescribed set: `{setNumber, type: warm_up|working|backoff, reps, amrap?,
targetWeightKg?, targetRpe?, restSeconds?, durationSeconds?}` — plus optional `repsMin`
for ranges:

| Kind | Fields | Example display |
|---|---|---|
| fixed reps | `reps` | `5` |
| rep range | `repsMin` + `reps` (upper) | `6–10` |
| timed | `durationSeconds`, `reps: 0` | `45s`, `1:00` |
| failure / AMRAP | `amrap: true`, `reps: 0` | `max` |
| load target | `targetWeightKg` | `65kg × 5 @8` |

Sessions may carry optional `conditioning {label, detail}` (cardio blocks — display-only
in MVP, not logged).

## Logging (trainer enters results)

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/logs/sessions` | see below |
| GET | `/v1/logs/sessions?clientId=&from=&to=` | logs with their sets, newest first, max 200 |
| GET | `/v1/logs/history?clientId=` | per-exercise 8-week aggregation: `recentSets[]`, `bestE1rm` — same shape the AI consumes |

`POST /v1/logs/sessions` body:

```json
{
  "clientId": "…",
  "programId": "…",
  "programSessionId": "… or null",
  "date": "2026-09-22",
  "perceivedEnergy": 7,
  "notes": "felt strong",
  "sets": [
    { "programExerciseId": "… or null", "exerciseId": "…", "setNumber": 1, "type": "warm_up", "weightKg": 60, "reps": 5 },
    { "programExerciseId": "…", "exerciseId": "…", "setNumber": 2, "type": "working", "weightKg": 100, "reps": 5, "rpe": 8 }
  ]
}
```

Guards: ≥1 set required; all `exerciseId`s must exist (**422** otherwise);
program must belong to the client (**422**); date `YYYY-MM-DD`.

## Periodization schemes (trainer library)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/schemes` | the trainer's saved schemes |
| POST | `/v1/schemes` | `{name, weeks: [{week, directive}]}` → 201 |
| DELETE | `/v1/schemes/:id` | removing a scheme never touches programs that already used it (they carry their own `phasing` copy) |

## Instruction templates (AI prompt library)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/ai/prompt-templates` | `{templates: [{id, name, content, updatedAt}]}` |
| POST | `/v1/ai/prompt-templates` | `{name, content}` → 201 |
| PUT | `/v1/ai/prompt-templates/:id` | `{name, content}` |
| DELETE | `/v1/ai/prompt-templates/:id` | — |

## Notifications (phase-change signals)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/notifications` | signals computed **on read** by the shared rule engine for the trainer's active programs — never stored as truth. Shape: `{signals: [{id, kind, severity, title, evidence, …}]}`; ids are deterministic (e.g. `block-ending:<programId>`, `offplan-vol:<programId>:w3`) |
| PUT | `/v1/notifications/:signalId/snooze` | `{until}` → upsert into `signal_snoozes`; GET filters snoozed |

Rule set (triggers, thresholds, suppression rules): [notifications.md](notifications.md).
Delivery (email via cron + outbox) is Phase L5 — the read path ships first.

## Exercises

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/exercises?q=` | case-insensitive name contains; seed library + trainer customs; max 50 |
| POST | `/v1/exercises` | `{name, primaryMuscleGroup, secondaryMuscleGroups?, equipment}` — custom exercise |

## AI generation

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/ai/generate` | `{clientId, basedOnProgramId?, providerId?, instructions?}` → 201 generation (status `validated` + `draft`) or **502** (`failed_validation` / `failed_provider`, error detail kept). Context bundle auto-includes instruction templates selection and periodization context (week N of M, directive, tonnage/e1RM trend) — see [ai-integration.md](ai-integration.md) |
| GET | `/v1/ai/generations?clientId=` | audit trail |
| POST | `/v1/ai/generations/:id/approve` | draft → real program (`draft` status, `aiAssisted: true`); **409** if not `validated`; **422** if unresolvable exercise refs |
| POST | `/v1/ai/generations/:id/reject` | mark rejected, nothing created |

Generation status lifecycle:

```
pending → validated ──approve──▶ approved  (+ program created in draft)
              │
              ├──reject──▶ rejected
              ├──failed_validation   (zod rejected the LLM output twice)
              └──failed_provider     (network / HTTP / auth error)
```

`providerId` values: `zai` (default, needs `ZAI_API_KEY`), `openai`
(`OPENAI_API_KEY`), `mock` (canned draft — for tests and UI development, no key).

### Error envelope

```json
{ "error": "invalid sessions document", "issues": { …zod tree } }
```

Status codes: 404 missing entity · 409 state conflict · 422 semantic rejection ·
502 upstream AI failure · 400 unconfigured provider.
