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
| `zai` | `glm-4.5-flash` | `ZAI_API_KEY` | **default**; free tier; 200K context |
| `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` | example of "extended to other models" |
| `mock` | canned draft | — (always "configured") | keyless tests + UI dev |

Per-provider overrides via env: `<ID>_API_KEY`, `<ID>_BASE_URL`, `<ID>_MODEL`.
Registry lives in `packages/shared/src/ai.ts` (`KNOWN_PROVIDERS`) — add Groq or
OpenRouter by adding one entry, zero code elsewhere.

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
   sits: `week 3 of 6 · directive +intensity · weekly tonnage 1.8t → 2.1t (+17%) ·
   best e1RM 77 → 80`. The scheme (structure) tells the model *what* this week should
   do; instruction templates (prose) tell it *how* you want programs written.
6. Trainer's free-text instructions for this generation (templates + one-off note)

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
