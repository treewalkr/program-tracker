/** AI generations (and the calls that start them) — schemas derived from the Drizzle table. See ./shared.ts. */
import { t } from "elysia";
import { aiGenerations, clients } from "@pt/db/schema";
import { createInsertSchema, createSelectSchema, createUpdateSchema, nonNull, spread } from "../utility";
import { str, as, oneOf, ProviderChoice } from "./shared";
import { GENERATION_KINDS, MAX_AI_BLOCK_WEEKS, MIN_BLOCK_WEEKS } from "@pt/shared";

const AiGenerationInsert = createInsertSchema(aiGenerations);
const AiGenerationUpdate = createUpdateSchema(aiGenerations, {
  instructions: str({ maxLength: 2000 }),
  direction: str({ maxLength: 500 }),
  revisionMessage: str({ minLength: 1, maxLength: 2000 }),
  rejectReason: str({ maxLength: 2000 }),
});
/** Optional values (never null) — handlers trim or pass them on as-is. */
const AiGenerationValues = t.Required(
  t.Pick(AiGenerationUpdate, ["instructions", "direction", "targetWeek", "revisionMessage", "rejectReason"])
);
/** Pending list rows: no draft or prompt fields, so the app-wide watcher can poll it cheaply. */
const AiGenerationSelect = createSelectSchema(aiGenerations, { kind: as(oneOf(GENERATION_KINDS)) });
const PendingFields = t.Pick(AiGenerationSelect, ["id", "clientId", "kind", "targetWeek", "createdAt"]);
const ClientSelect = createSelectSchema(clients);
const ClientName = t.Pick(ClientSelect, ["name"]);

export const AiGenerationModel = {
  generate: t.Object({
    ...spread(t.Pick(AiGenerationInsert, ["clientId"])),
    ...spread(t.Pick(AiGenerationUpdate, ["basedOnProgramId"])),
    ...ProviderChoice,
    instructions: t.Optional(nonNull(AiGenerationValues.properties.instructions)),
    direction: t.Optional(nonNull(AiGenerationValues.properties.direction)),
    targetWeek: t.Optional(nonNull(AiGenerationValues.properties.targetWeek)),
    /** Block drafts: weeks to write (the trainer's field wins over the AI's plan). Not a column. */
    plannedWeeks: t.Optional(t.Integer({ minimum: MIN_BLOCK_WEEKS, maximum: MAX_AI_BLOCK_WEEKS })),
    /** Block drafts: odd weeks A, even weeks B. Not a column. */
    alternate: t.Optional(t.Boolean()),
  }),
  /** Fill with AI: the program whose remaining weeks the AI writes. */
  fill: t.Object({
    ...spread(t.Pick(AiGenerationInsert, ["clientId"])),
    basedOnProgramId: nonNull(AiGenerationUpdate.properties.basedOnProgramId),
    ...ProviderChoice,
    instructions: t.Optional(nonNull(AiGenerationValues.properties.instructions)),
  }),
  /** Stored as `rejectReason`. */
  reject: t.Optional(t.Object({ reason: t.Optional(nonNull(AiGenerationValues.properties.rejectReason)) })),
  /** Stored as `revisionMessage`. */
  revise: t.Object({ message: nonNull(AiGenerationValues.properties.revisionMessage) }),
  /** `GET /generations/pending`: the trainer's running generations, newest first. */
  pending: t.Array(t.Object({ ...spread(PendingFields), clientName: ClientName.properties.name })),
};
