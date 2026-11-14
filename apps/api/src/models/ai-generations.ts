/** AI generations (and the calls that start them) — schemas derived from the Drizzle table. See ./shared.ts. */
import { t } from "elysia";
import { aiGenerations } from "@pt/db/schema";
import { createInsertSchema, createUpdateSchema, nonNull, spread } from "../utility";
import { str, as, ProviderChoice } from "./shared";
import { MAX_AI_BLOCK_WEEKS, MIN_BLOCK_WEEKS } from "@pt/shared";

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
  /** Stored as `rejectReason`. */
  reject: t.Optional(t.Object({ reason: t.Optional(nonNull(AiGenerationValues.properties.rejectReason)) })),
  /** Stored as `revisionMessage`. */
  revise: t.Object({ message: nonNull(AiGenerationValues.properties.revisionMessage) }),
};
