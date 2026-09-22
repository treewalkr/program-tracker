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
| POST | `/v1/clients` | `{name, email, goals?, limitations?, daysPerWeek?}` → 201 |
| GET | `/v1/clients/:id` | client + `currentProgram` + all their programs |
| PATCH | `/v1/clients/:id` | partial update of name/goals/limitations/daysPerWeek/status |

## Programs

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/programs?clientId=` | list (optionally filtered), newest first |
| POST | `/v1/programs` | `{name, clientId?, description?, sessions, aiAssisted?, createdFromProgramId?}` — `sessions` must pass the `ProgramSession[]` zod schema or **422** |
| GET | `/v1/programs/:id` | one program |
| PUT | `/v1/programs/:id` | `{sessions}` — replace document, **version++** |
| PATCH | `/v1/programs/:id/status` | `{status: draft\|active\|archived}` — activating archives the client's other active programs |

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

## Exercises

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/exercises?q=` | case-insensitive name contains; seed library + trainer customs; max 50 |
| POST | `/v1/exercises` | `{name, primaryMuscleGroup, secondaryMuscleGroups?, equipment}` — custom exercise |

## AI generation

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/ai/generate` | `{clientId, basedOnProgramId?, providerId?, instructions?}` → 201 generation (status `validated` + `draft`) or **502** (`failed_validation` / `failed_provider`, error detail kept) |
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
