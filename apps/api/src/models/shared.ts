/**
 * Row-field schemas for HTTP validation, derived from the Drizzle tables (the source of truth
 * for column names, types and nullability), one file per feature in this folder. Refinements
 * add the API contract on top: length limits, literal unions from @pt/shared, and JSON shapes.
 * Nested JSON documents (program weeks, phasing, …) stay zod in @pt/shared — their columns are
 * `t.Unsafe<T>(t.Any())` here (typed, unchecked) and the handler `safeParse`s them.
 *
 * Create bodies take required fields from `*Insert` and optional ones from `*Update`:
 * drizzle-typebox 0.3 types a refined optional insert column as required (runtime is right),
 * while update schemas type every field optional.
 *
 * Each generated schema is bound to a variable before `t.Pick`/`t.Omit` (Elysia drizzle docs:
 * inlining it trips "type instantiation is possibly infinite"). Routes always Pick the writable
 * fields — never id, trainerId or timestamps.
 *
 * This file holds the refinement helpers and the schemas used by more than one feature.
 */
import { t, type TSchema } from "elysia";
import { aiGenerations, trainers } from "@pt/db/schema";
import { FEEDBACK_AI_MODES, WEEKS_CHOICES } from "@pt/shared";
import { createInsertSchema, createUpdateSchema, nonNull, spread } from "../utility";

type StringOptions = Parameters<typeof t.String>[0];
/** Keep the generated string schema (e.g. uuid format) and add limits. */
export const str = (limits: StringOptions) => (schema: ReturnType<typeof t.String>) =>
  t.String({ ...schema, ...limits });
/** `t.UnionEnum` without its implicit `default: values[0]` — Elysia fills defaults into bodies,
 *  so an omitted optional field (e.g. a client's status on PATCH) would silently become values[0]. */
export const oneOf = <const V extends readonly [string, ...string[]]>(values: V) => {
  const { default: _default, ...schema } = t.UnionEnum(values);
  return schema as ReturnType<typeof t.UnionEnum<V>>;
};
/** Replace the column schema. A callback (not a bare schema) so drizzle still adds null/optional. */
export const as =
  <S extends TSchema>(schema: S) =>
  () =>
    schema;

/** Expected-failure body (`status(4xx, { error })`); 422s may carry zod `issues`. */
export const ErrorBody = t.Object({ error: t.String(), issues: t.Optional(t.Unknown()) });

// Trainers — the account (own settings) and admin (other trainers) features both write them.
const trainerFields = {
  name: str({ minLength: 1, maxLength: 120 }),
  email: as(t.String({ format: "email", maxLength: 254 })),
  feedbackAiMode: as(oneOf(FEEDBACK_AI_MODES)),
  lastWeeksChoice: as(oneOf(WEEKS_CHOICES)),
};
export const TrainerInsert = createInsertSchema(trainers, trainerFields);
export const TrainerUpdate = createUpdateSchema(trainers, trainerFields);

// Which model runs an AI call — chat, generations and imports all take it. The provider
// columns live on ai_generations and carry no refinements.
const AiProvider = createUpdateSchema(aiGenerations);
const AiProviderEffort = t.Required(t.Pick(AiProvider, ["effort"]));

/** Which model runs a call; absent = the default provider. Every AI route takes these. */
export const ProviderChoice = {
  ...spread(t.Pick(AiProvider, ["providerId", "model"])),
  effort: t.Optional(nonNull(AiProviderEffort.properties.effort)),
};
