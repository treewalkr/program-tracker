# API Reference

Base URL (dev): `http://localhost:4000` · All bodies are JSON.

Interactive OpenAPI docs (Scalar): `http://localhost:4000/openapi` ·
raw spec: `http://localhost:4000/openapi/json` — generated from the live
route schemas (TypeBox + zod via `mapJsonSchema`), grouped by tag.

## System

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ok, service, time}` |
| GET | `/v1/ai/providers` | provider registry; `configured: bool`, `model` (default) + `models` (pickable list) per provider; **never returns API keys**. List overridable via `<ID>_MODELS` (csv env) |

## Clients

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/clients` | all clients of the (single) trainer |
| POST | `/v1/clients` | `{name, email, goals?, limitations?, daysPerWeek?, trainingDays?, cardioTarget?}` → 201 |
| GET | `/v1/clients/:id` | client + `currentProgram` + all their programs |
| PATCH | `/v1/clients/:id` | partial update of name/goals/limitations/daysPerWeek/trainingDays/cardioTarget/status |

`trainingDays`: weekday ints 1=Mon…7=Sun (e.g. `[1,2,4,6]`) — powers the dashboard
week strip and honest adherence (expected sessions come from the *client's calendar*,
not the program's day count).

`cardioTarget`: `{unit: minutes|sessions|zone_minutes, value: 1–10000}` or `null` — the
client's standing weekly cardio target. Resets every ISO week (Monday-start); progress
is computed client-side from session logs (no progress endpoint). Feeds the AI prompt
and the `cardio-behind` signal.

## Programs

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/programs?clientId=` | list (optionally filtered), newest first |
| POST | `/v1/programs` | `{name, clientId?, description?, direction?, weeks, phasing?, aiAssisted?, createdFromProgramId?}` — `weeks` must pass the `ProgramWeeksDocument` zod schema or **422** (`"invalid weeks document"`) |
| GET | `/v1/programs/:id` | one program |
| PUT | `/v1/programs/:id` | `{weeks, phasing?, direction?}` — replace document, **version++** (absent direction untouched, null clears) |
| PATCH | `/v1/programs/:id/direction` | `{direction: string \| null}` — sets standing direction steer (≤500 chars), **no version bump** |
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

## Examples (gold-standard library)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/examples?programId=` | `{examples: [{id, programId, goal, level, daysPerWeek, note, createdAt, program}]}` newest first; optional `programId` filter (program-page membership) |
| POST | `/v1/examples` | `{programId, goal, level: beginner\|intermediate\|advanced, daysPerWeek?, note?}` → 201; `daysPerWeek` defaults to the program's first-week day count; marking is metadata only — the program row is never touched; duplicate mark → **409**, unknown program → **404**, invalid tags → **422** |
| PATCH | `/v1/examples/:id` | partial tag edit; `note: null` clears the note, absent fields untouched |
| DELETE | `/v1/examples/:id` | unmark — deletes the example row only |

The trainer curates these gold-standard programs; AI generation retrieves the
best-matching ones (goal-word overlap + days/week proximity) and injects them
into the prompt as few-shot examples. The generation row records which were
used in `exampleProgramIds`.

## Logging (trainer enters results)

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/logs/sessions` | see below |
| GET | `/v1/logs/sessions?clientId=&from=&to=` | logs with their sets, newest first, max 200 |
| GET | `/v1/logs/history?clientId=` | per-exercise 8-week aggregation: `recentSets[]`, `bestE1rm` — same shape the AI consumes |

`POST /v1/logs/sessions` body — lifting (default `kind`) or cardio:

```json
{
  "clientId": "…",
  "programId": "…",
  "programSessionId": "… or null",
  "date": "2026-09-22",
  "kind": "lifting",
  "perceivedEnergy": 7,
  "notes": "felt strong",
  "sets": [
    { "programExerciseId": "… or null", "exerciseId": "…", "setNumber": 1, "type": "warm_up", "weightKg": 60, "reps": 5 },
    { "programExerciseId": "…", "exerciseId": "…", "setNumber": 2, "type": "working", "weightKg": 100, "reps": 5, "rpe": 8 }
  ]
}
```

Cardio session — same day can also hold a lifting log (two rows):

```json
{
  "clientId": "…",
  "programId": "…",
  "programSessionId": "… or null",
  "date": "2026-09-22",
  "kind": "cardio",
  "cardio": { "modality": "Run", "durationMin": 35, "hrZone": 2, "distanceKm": 5.5, "rpe": 6 },
  "sets": []
}
```

Guards (**422** `"invalid log"`): `kind` defaults to `lifting`;
lifting logs need ≥1 set and must not carry `cardio`; cardio logs need `cardio`
(`modality` required, `durationMin` 1–300, `hrZone` 1–5) and must not carry sets;
all `exerciseId`s must exist; program must belong to the client; date `YYYY-MM-DD`.

## Periodization schemes (trainer library)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/schemes` | the trainer's saved schemes |
| POST | `/v1/schemes` | `{name, weeks: [{week, directive}]}` → 201 |
| DELETE | `/v1/schemes/:id` | removing a scheme never touches programs that already used it (they carry their own `phasing` copy) |

## Kinetic chains (trainer library & analytics)

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/chains` | the trainer's five chains (`{chains: [{id, name, muscleGroups, sortOrder}]}`), lazily seeded on first read |
| PUT | `/v1/chains/:id` | `{muscleGroups: string[]}` — update muscle groups for a chain (min 1, unique, ⊆ `CHAIN_MUSCLE_GROUPS`) |
| GET | `/v1/chains/week?clientId=` | working-set volume per chain for the current ISO week (Monday-start): `{weekStart, chains: [{id, name, muscleGroups, sets}]}` |

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
| POST | `/v1/ai/generate` | `{clientId, basedOnProgramId?, providerId?, model?, instructions?, direction?, targetWeek?}` → 201 generation (status `validated` + `draft`) or **502** (`failed_validation` / `failed_provider`, error detail kept); unknown `model` for the provider → **400**. When `targetWeek` is set, operates in **weekly mode**: validates `basedOnProgramId` is active, `targetWeek = weekOf + 1 ≤ weeks.length`, inserts `kind: "week"`, and drafts week N+1. Context bundle auto-includes instruction templates selection, periodization context, standing direction, and matched gold-standard examples (recorded on the generation row as `exampleProgramIds`) — see [ai-integration.md](ai-integration.md). GLM 5.x models always think (Z.ai rejects `disabled`) — the provider layer sends `budget: low` and a roomier token cap automatically |
| GET | `/v1/ai/generations?clientId=` | audit trail |
| POST | `/v1/ai/generations/:id/approve` | draft → real program; **409** if not `validated`; **422** if unresolvable exercise refs; **422** `"invalid weeks document"` if the draft maps to a weeks document that fails the boundary (>7 training days) — the generation flips to `failed_validation`. In block mode: creates a new draft program (`draft` status, `aiAssisted: true`, copies direction). In week mode: replaces the target week in place on the active program (`version++`, fresh ids, carries weekdays) |
| POST | `/v1/ai/generations/:id/reject` | mark rejected, nothing created |

Generation status lifecycle:

```
pending → validated ──approve──▶ approved  (+ program created in draft)
              │            └──approve-breach──▶ failed_validation  (weeks document >7 days)
              ├──reject──▶ rejected
              ├──failed_validation   (zod rejected the LLM output twice)
              └──failed_provider     (network / HTTP / auth error)
```

`providerId` values: `zai` (default, needs `ZAI_API_KEY`), `openai`
(`OPENAI_API_KEY`), `mock` (canned draft — for tests and UI development, no key).

## Paste import (notes → draft)

Trainer pastes a plain-text program; it is read into a reviewable result that fills the new-program editor. Design: `docs/paste-import-plan.md`.

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/ai/imports` | `{clientId, text ≤ 20,000 chars, providerId?, model?, effort?}`. Inserts a `pending` `ai_imports` row, splits the text into chunks (week headers, else ~60 lines at blank/separator lines), reads them in parallel (`callLlm`, purpose `program_import`, temperature 0, effort = the pick or the provider default — `max` on deepseek), then checks, matches and groups in code and settles the row. **201** `done` (with `result`); **502** `failed` when no chunk could be read; **200** unchanged when a cancel landed first; **422** text over the limit or with nothing to read; **400** unconfigured provider/model/effort. Blocks like `/generate` — poll `GET /:id` if the connection drops |
| GET | `/v1/ai/imports?clientId=` | the client's 5 most recent imports, newest first, without `text`/`result` (`preview` = first 120 chars) |
| GET | `/v1/ai/imports/:id` | the row: `status`, `chunksDone` / `chunksTotal` (progress), `result` once done, `historyProgramIds` (set once history is saved) |
| POST | `/v1/ai/imports/:id/cancel` | `pending` → `cancelled` and aborts in-flight calls (cancellation registry); **409** if not pending |
| POST | `/v1/ai/imports/:id/history` | history import (paste notes v2). `{weekStarts: YYYY-MM-DD[] (one per week of the result), exercises: {historyExerciseKey(sourceName): exerciseId}}`. Rebuilds the plan server-side from the stored `result` with the client's `trainingDays` (`buildHistory`, `packages/shared/src/importHistory.ts`) and writes, in one transaction: one `archived` program per block with logged sessions (`activatedAt` = its first week start, description "Imported from notes on <date>"), their `session_logs` / `set_logs`, and `history_program_ids` on the import. No signal outbox. **201** `{programs: [{id, name}], sessions, sets, skipped}` (`skipped` = what was left out, with why — days after today, flagged numbers, > 20 sets…); **409** already saved; **422** not `done`, a week start after today (+1 day slack), a wrong number of week starts, an exercise outside the trainer's catalog (`ids`), or nothing to save |
| DELETE | `/v1/ai/imports/:id/history` | undo: deletes the import's history programs (logs cascade) and clears `history_program_ids`. **200** `{removed}`; **409** nothing saved |
| POST | `/v1/vocabulary/aliases` | `{items: [{alias, exerciseId, source: "import" \| "manual"}]}` (1–200) → **201** `{aliases}`. Upserts the trainer's personal aliases on the normalized alias (lowercase, punctuation removed, single spaces); the exercise must be global or the trainer's own (**404** otherwise). Global (`trainer_id` null) aliases are seed-only |

Import status: `pending → done | failed | cancelled`. Settling only touches a `pending` row, so a cancel always wins. A chunk that fails is listed in `result.unread`; the other chunks are kept. Every id (client, import) is ownership-checked like the rest of the API (404 for another trainer's).

`result` (`ImportResult`, `@pt/shared` `import.ts`): `weeks → days → sessions → exercises`, each exercise with its source `line`, `sourceName` (as written), `name` (expanded), the raw `prescription`/`actuals`, the mapped `sets: PrescribedSet[]`, a combined `note`, `flags` (`warn` = amber, `info` = how a range was approximated; `blocking` for program limits) and `match` (`alias · exact · fuzzy · new`, with up to 3 fuzzy candidates); plus `skipped`, `unused` lines, `unread` chunks, `blocks` (weeks grouped by Jaccard ≥ 0.6 on exercise names), `defaultBlock` (the latest) and `alternating`.

`mock` reads the Week 11–12 sample (`packages/shared/fixtures/import/week11-12.txt`) from a hand-written extraction; other text reads as unused lines. A line containing `mock: unreadable` makes its chunk fail (tests).

### Error envelope

```json
{ "error": "invalid sessions document", "issues": { …zod tree } }
```

Status codes: 404 missing entity · 409 state conflict · 422 semantic rejection ·
502 upstream AI failure · 400 unconfigured provider.


## Role labels

The label on a program exercise (`role`): a built-in key or `label:<uuid>` for one of the trainer's own. Built-ins, in default order: `power` Power · `primary` Primary · `secondary` Secondary · `strength` Strength (chip "Str") · `accessory` Auxiliary (chip "Aux") · `core` Core. Design: `docs/role-labels-plan.md`.

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/vocabulary/role-labels` | the merged list by `rank`: the six built-ins (the trainer's overrides applied) + the trainer's own labels, archived ones included with `archived: true`. Each item: `{key, builtinKey, id, name, chip, description, category ("priority" \| "quality" \| "region", null for own labels), rank, archived}` |
| POST | `/v1/vocabulary/role-labels` | `{name ≤ 40, chip? ≤ 12, description ≤ 200, after?}` → **201** the label. `description` is required; `after` = key of the label it sorts right after (rank halfway to the next one; absent = last). **409** when the name (any case) is a built-in's or another of the trainer's; re-creating an archived label's name restores it with the new meaning |
| PATCH | `/v1/vocabulary/role-labels/:id` | `:id` = a built-in key or an own label's id. Built-ins: `{chip?, description?, rank?}` upserts the trainer's override row (`""` = back to the default); a different `name` is **422**. Own labels: `{name?, chip?, description?, rank?}` (empty description **422**, name clash **409**) |
| DELETE | `/v1/vocabulary/role-labels/:id` | own labels only: archives (out of the picker and the AI's list; programs still show it) → the archived label. A built-in key is **422** |

Ownership: an own label's id goes through `PATH_OWNERS` like every other id (404 for another trainer's); built-in keys are exempt. The AI prompts list the active labels (key, name, meaning) in the role rule and in the JSON shape's `role` field. Every settled draft is checked in code (`checkDraftRoles`): a missing, unknown or archived label is filled by `suggestRole`; a session with more than one Primary keeps them and gets a "Role check:" note at the end of the rationale.

## Client messages (weekly result summary + compliment)

Client-facing weekly messages the trainer copies into LINE by hand — **no
delivery integration** (Q6: LINE, copy-paste; no Messaging API, no client LINE
ids, no delivery tracking). Numbers are computed deterministically by
`weekSummary` (shared, pure) — the LLM only phrases.

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/client-messages/generate` | `{clientId, programId, week (1–26), providerId?, model?}` → 201 row (`status: "validated"`, `draft.message` ≤ 1200 chars, `stats` snapshot) or **502** (`failed_validation`/`failed_provider`). Guards: unknown client/program **404**; program of another client **422** `"program does not belong to client"`; week window without logged sessions **422** `"week N has no logged sessions"` |
| GET | `/v1/client-messages?clientId=` | audit trail, newest first (optionally filtered) |
| GET | `/v1/client-messages/:id` | one row, or **404** |
| POST | `/v1/client-messages/:id/approve` | `{text?}` — trainer's edited text (≤ 1200 chars) becomes `finalText`; omitted → the draft message verbatim. **409** unless `validated`; whitespace-only text **422** |
| POST | `/v1/client-messages/:id/reject` | mark rejected, nothing sent |

Row shape: `{id, trainerId, clientId, programId, week, providerId, model,
status, draft: {message} \| null, stats: WeekSummaryStats \| null, finalText,
error, createdAt}`. Statuses reuse the generation lifecycle (`pending` →
`validated` → `approved`/`rejected`, `failed_*` on provider/validation errors).
`stats` is the deterministic snapshot the prompt was built from — what the AI
saw is always reconstructible. The only "delivery" is the trainer's copy button
(`finalText`), which pastes into LINE manually.
