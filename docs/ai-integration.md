# AI Integration

## Principle

The LLM is a **drafting assistant behind a human gate**. It reads real training
history and produces a structured JSON proposal. It never writes anything a client
can see, and nothing it produces is stored as a program until a trainer approves.

## Provider abstraction

Every provider speaks the OpenAI chat-completions dialect — one HTTP client
(`apps/api/src/ai/provider.ts`) covers all of them:

| Provider id | Default model | Key env var | Notes |
|---|---|---|---|
| `zai` | `glm-5.3-flash` (first of `models`) | `ZAI_API_KEY` | **default**; `glm-5.3` also listed; always thinks — effort low/high/max sets the thinking budget |
| `deepseek` | `deepseek-flash` (first of `models`) | `DEEPSEEK_API_KEY` | OpenAI-compatible; `deepseek-v4-pro` also listed; both support reasoning effort none/low/high/max ("none" = thinking off); JSON mode needs "json" in the prompt (all JSON prompts already say it) |
| `mock` | canned draft | — (always "configured") | keyless tests + UI dev |

Per-provider overrides via env: `<ID>_API_KEY`, `<ID>_BASE_URL`, `<ID>_MODEL`
(default), `<ID>_MODELS` (csv list). Registry lives in
`packages/shared/src/ai.ts` (`KNOWN_PROVIDERS`) — add Groq or OpenRouter by
adding one entry, zero code elsewhere. The registry carries only `models`
(first entry = default); the resolved default model is computed at read time.

Call shape: `POST {baseUrl}/chat/completions` with
`response_format: {type: "json_object"}` (JSON mode).

> **License note:** Z.ai's *GLM Coding Plan* subscription may NOT be used for SDK
> embedding — the app uses a regular pay-as-you-go API key (flash models are free).

## What the model receives (`buildGenerationMessages`)

**System** — role ("expert S&C coach drafting the NEXT block"), safety rules
(client limitations are hard constraints), the exact output JSON schema, and
progression rules:
- reuse catalog `exerciseId`s where suitable; new movements by name
- keep exercises the client is progressing on unless instructed otherwise
- progress load ~2.5% conservatively; regress if RPEs were 9+ or reps missed
- warm-up sets for the first heavy compound per session
- session count must equal the client's `daysPerWeek`

**User** — the context bundle:
1. Client profile: goals, **limitations (verbatim, labelled as hard constraints)**, days/week
2. Current program: every session, exercise, prescribed set (compact text)
3. Training history (8 weeks): per exercise — recent working sets (`100kg × 5 @ RPE 8`)
   and best estimated 1RM (Epley, capped at 12 reps)
4. Exercise catalog: `id | name (muscle, equipment)` lines
5. **Periodization context (auto-injected, read-only)** — where in the wave the client
   sits: `week 3 of 6 · directive +intensity · weekly overall volume 1.8t → 2.1t (+17%) ·
   best e1RM 77 → 80`. The scheme (structure) tells the model *what* this week should
   do; instruction templates (prose) tell it *how* you want programs written.
6. Trainer's free-text instructions for this generation (templates + one-off note)

**Instruction templates** are standing rules (RPE caps, block conventions, equipment
constraints) stored per trainer and selected per generation; they merge into item 6
ahead of the one-off note. **Periodization context** (item 5) is never editable — it
is derived from the program's scheme and logs.

**Draft guidance (Phase L4):** AI drafts should propose `phasing` (phase names,
plannedWeeks, and `weeks` taken from the client's saved scheme) and
`targetWeightKg` progressing from the most recent logged loads (last + 2.5 kg grid by
default). Rationale must cite actual logged numbers.

## The output gate

The only accepted shape is `AiProgramDraft` (zod, `packages/shared/src/ai.ts`):

```jsonc
{
  "name": "Lower/Hypertrophy Block 2",
  "rationale": "…trainer-facing reasoning referencing actual numbers…",
  "clientSummary": "…client-facing blurb…",
  "sessions": [
    { "name": "Day A — Lower", "exercises": [
        { "exerciseId": "…", "prescribedSets": [ /* same set schema as programs */ ] },
        { "exerciseName": "Landmine Press", "prescribedSets": [ … ] }   // new movement
    ]}
  ]
}
```

Pipeline (`POST /v1/ai/generate`):

1. Build context from DB → build messages
2. Call provider (JSON mode)
3. Strip fences/prose (`extractJsonObject`) → `JSON.parse` → `AiProgramDraft.safeParse`
4. On validation failure: **one retry**, then give up with `failed_validation`
   (error detail stored on the audit row)
5. Valid draft → generation row, status `validated`

## Approval (`POST /v1/ai/generations/:id/approve`)

Exercise references resolve in strict order:

1. `exerciseId` exists in catalog → use it
2. `exerciseName` matches a catalog name (case-insensitive exact) → use it
3. name unknown → **create custom exercise** (muscle `full_body`, equipment `other`;
   trainer recategorizes later)
4. bogus id and no name → **422**, generation kept, trainer regenerates

On success a program is created with `status: draft`, `aiAssisted: true`,
`createdFromProgramId` set. The trainer then edits freely and activates when ready
(activation archives the previous active program automatically).

## Weekly generation cadence

Cadence becomes weekly: block up front, refine weekly.

1. **Initial block creation:** generates and approves the entire mesocycle (all weeks).
   The trainer can attach an optional standing `direction` (≤500 chars).
2. **Weekly re-draft:** towards the end of each week (nudged by `week-ending`), the trainer
   triggers "Generate week N+1" (`POST /v1/ai/generate` with `targetWeek`).
3. **Weekly prompt framing (`buildWeekMessages`):**
   - System framing: drafting the NEXT WEEK (week N+1 of plannedWeeks) of the CURRENT block.
   - Sessions rule: exactly one week — client's training days. Periodization is fixed (`phasing` omitted).
   - Follows next week's directive and target from the program's scheme.
   - Injects standing `direction`: `STANDING DIRECTION (block-level — applies to every generation of this block): ...`
   - Keeps exercise selection stable week-to-week; swaps must be justified in rationale.
4. **In-place replacement on approval:**
   Approving a `kind: "week"` generation replaces week N+1 in place on the active program via `replaceWeek`:
   - Fresh session and exercise IDs.
   - Weekdays carried over: `oldWeek.days[i].weekday ?? sortedTrainingDays[i] ?? null`.
   - `version++`, other weeks and phasing untouched, program remains `active`.

## Client messages (`POST /v1/client-messages/generate`)

The one AI output a **client** ever reads. Stats-first: every number is computed
deterministically by `weekSummary` (shared, pure — volume, % delta, working
sets, avg RPE, best e1RM, per-exercise PRs vs the prior block-best, adherence,
next week's directive) and handed to the model pre-rendered
(`clientMessageStatsText`). The model phrases; it never computes — and the
system prompt forbids inventing or estimating any number not in the data.

Output shape is `AiClientMessageDraft` (`{"message": string}`, ≤ 1200 chars —
LINE-sized); same call → zod gate → one retry → audit-row pipeline as program
generation, in a dedicated `client_messages` table (provider/model/status/error
plus the `stats` snapshot, so what the AI saw is always reconstructible).

Two extra safety rules, because compliments are the riskiest text this app
produces: the compliment must reference a specific effort, PR, or consistency,
and it must never comment on body weight or appearance (effort, consistency, or
strength only). No jargon ("e1RM", "RPE table", "volume") — plain words and real
numbers.

**Gate + delivery:** nothing exists for the client until the trainer approves
(`POST /:id/approve` — the trainer's edited text becomes `finalText`). The only
delivery surface is a copy button: the trainer pastes into LINE by hand. No
Messaging API, no client LINE ids, no delivery/read tracking — nothing is ever
sent automatically.

## Logging (`ai/llm.ts`, `llm_*` tables)

Every provider attempt goes through `callLlm()`; the call sites (block/week generate, revision, week revision, proposal turn, chat Q&A, client message, distill, feedback check, rule extract) never call `provider.ts` directly. The mock provider takes the same path with `is_mock = true`.

- **`llm_calls`**: one row per HTTP attempt, append-only. It holds the purpose, links (trainer, client, generation, chat message, client message), provider, model, effort, temperature, max tokens, `prompt_version` (`<builder>:<hash of prompt.ts>`), `app_build`, the attempt number, the structured `context` the prompt was built from, `response_raw`, `reasoning`, `parsed`, the status (`ok · provider_error · parse_error · validation_error · aborted`), tokens, latency and finish reason. Attempts of one user action share a `turn_id`. The only update is `linkTurn()`, which attaches a reply row created after the call.
- **`llm_blobs`**: prompt messages stored by sha256. Calls reference them in order (`request_blob_ids`), so the system prompt and the catalog are stored once. The catalog in `context` is stored as a blob too.
- **`llm_feedback`**: every verdict, insert-only. Implicit signals are written by the routes: approve unedited/edited (with the draft→week diff), reject, revise, regenerate, program edited ≤14 days after approval, proposal built/ignored, client message approved (with draft vs final)/rejected, chat cleared. Explicit 👍/👎, reason chips and a comment come from `POST /v1/ai/feedback`, which also takes Adjust (proposal) and Copy (client message) from the UI. Vocabulary lives in `@pt/shared` `llm.ts`.
- **Detailed notes + coaching rules** (plan §10): `POST /v1/ai/feedback/notes` pins a note (signal `note`) to part of an output. `anchor` is a draft slot (session, exercise) or a quoted span of a reply, plus `comment`, `correction` ("what instead") and `scope` (`once · client · always`). A 👎 can carry `correction` + `scope` too. When the scope isn't `once`, a `rule_extract` call proposes a `coaching_rules` row with status `proposed`. Only rules the trainer confirms (`POST /v1/ai/rules/:id/confirm`, or on the `/rules` page) become `active`. `loadContext` loads active rules (client rules first, then newest, 30 max), and every builder renders them as `COACHING RULES (…)` beside LEARNED PREFERENCES. The rule ids go into `context.ruleIds`, and `callLlm` bumps `applied_count` once per call. Proposed and retired rules never reach a prompt. "Apply to this draft" (`POST /v1/ai/feedback/notes/:id/apply`) sends the note through `runRevision` as text. "Remember this" (`POST /v1/ai/rules/extract`) proposes a rule from a chat-built revision. When a note names a broken rule, `llm_feedback.rule_id` is set and `violated_count` goes up; on confirm, the source notes' empty `rule_id` is linked to the new rule. Client-scoped rules are deleted with their client. Notes also feed distill (signal kind `note`) and the `eval`/`fewshot` exports (`notes`: anchor + comment + correction).
- **Never fails the request**: log writes are wrapped in try/catch and `console.error`.
- **Clear chat** sets `chat_messages.hidden_at`. Hidden rows leave the thread and the model's history, but stay in the dataset.
- **Client deletion** keeps the log. FKs become null, and a `BEFORE DELETE` trigger replaces the client's name with `[client]` in their calls' blobs, responses, context and feedback.
- **Datasets**: the `llm_examples` view labels each turn's final call (gold / silver / negative / unlabeled), and `llm_pairs` pairs approved drafts with the drafts they replaced. `bun run llm:export --format sft|dpo|eval|fewshot` writes pseudonymized JSONL to `llm-export/` (client names become `Client-<hash6>`, emails are dropped). `bun run llm:prune` blanks `response_raw`/`reasoning` on unlabeled ok calls older than 180 days. Counts by purpose and label are on the admin page (`GET /v1/admin/llm-stats`).

## Safety rules (non-negotiable)

1. Limitations reach the prompt verbatim, labelled "LIMITATIONS (hard constraints)".
2. AI output is advisory: `draft` status until a human approves; `active` only by
   explicit trainer action.
3. Every generation is auditable: provider, model, status, draft or error, timestamps.
4. Zero trust in model JSON: it's parsed and validated before *anything* happens.

## Why JSON mode + zod instead of function calling

Portable across every OpenAI-compatible provider (function-calling schemas vary more
than JSON mode), one schema definition reused for programs and drafts, and failures
are deterministic and testable — the `mock` provider exercises the exact same path
a real provider takes.
