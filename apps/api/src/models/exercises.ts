/** Exercises — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { exercises } from "@pt/db/schema";
import { createInsertSchema, createUpdateSchema, spread } from "../utility";
import { str, as } from "./shared";
import { MAX_MOVEMENT_PATTERNS } from "@pt/shared";

/** Vocabulary fields stay plain strings: the route checks them with the shared zod enums
 *  (its `invalid <field>` 422), and web's ExerciseInput/ExercisePatch DTOs type them as string. */
const Vocab = t.String({ maxLength: 40 });
const exerciseFields = {
  name: str({ minLength: 1, maxLength: 160 }),
  primaryMuscleGroup: as(Vocab),
  secondaryMuscleGroups: as(t.Array(Vocab, { maxItems: 4 })),
  equipment: as(Vocab),
  movementPatterns: as(t.Array(Vocab, { maxItems: MAX_MOVEMENT_PATTERNS })),
  functionalMovement: as(Vocab),
  note: str({ maxLength: 280 }),
};

/** Deprecated single pattern, still accepted from browser tabs on the previous web build
 *  (it sets the whole list to that one tag). Remove with the movement_pattern column. */
const LegacyPattern = t.Optional(t.Union([Vocab, t.Null()]));

const ExerciseInsert = createInsertSchema(exercises, exerciseFields);
const ExerciseUpdate = createUpdateSchema(exercises, exerciseFields);

export const ExerciseModel = {
  create: t.Object({
    ...spread(t.Pick(ExerciseInsert, ["name", "primaryMuscleGroup", "equipment"])),
    ...spread(t.Pick(ExerciseUpdate, ["secondaryMuscleGroups", "movementPatterns", "functionalMovement", "note"])),
    movementPattern: LegacyPattern,
  }),
  /** `archived` toggles the server-owned `archivedAt` stamp. */
  update: t.Object({
    ...spread(
      t.Pick(ExerciseUpdate, [
        "name",
        "primaryMuscleGroup",
        "secondaryMuscleGroups",
        "equipment",
        "movementPatterns",
        "functionalMovement",
        "note",
      ])
    ),
    movementPattern: LegacyPattern,
    archived: t.Optional(t.Boolean()),
  }),
};
