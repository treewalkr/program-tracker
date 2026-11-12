/** Clients — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { clients } from "@pt/db/schema";
import {
  BODYWEIGHT_KG_RANGE,
  CARDIO_TARGET_UNITS,
  CLIENT_EXPERIENCES,
  CLIENT_SEXES,
  CLIENT_STATUSES,
  HEIGHT_CM_RANGE,
  PHONE_MAX,
  type CardioTarget,
  type DeloadSettings,
  type OneRepMaxes as OneRepMaxesType,
} from "@pt/shared";
import { createInsertSchema, createSelectSchema, createUpdateSchema, spread } from "../utility";
import { str, oneOf, as } from "./shared";

const Day = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const IsoWeekday = t.Integer({ minimum: 1, maximum: 7 });

/** exerciseId → { kg, date } (mirrors shared `OneRepMaxes`). */
const OneRepMaxes = t.Record(
  t.String({ minLength: 1 }),
  t.Object({ kg: t.Number({ exclusiveMinimum: 0, maximum: 600 }), date: Day }),
  { maxProperties: 200 }
);

/** Narrow types only — shared by request and response schemas. */
const clientRow = {
  status: as(oneOf(CLIENT_STATUSES)),
  experience: as(oneOf(CLIENT_EXPERIENCES)),
  sex: as(oneOf(CLIENT_SEXES)),
  trainingDays: as(t.Unsafe<number[]>(t.Any())),
  cardioTarget: as(t.Unsafe<CardioTarget>(t.Any())),
  cardioDays: as(t.Unsafe<number[]>(t.Any())),
  oneRepMaxes: as(t.Unsafe<OneRepMaxesType>(t.Any())),
  deloadSettings: as(t.Unsafe<DeloadSettings>(t.Any())),
};

/** Write limits — request bodies only. `deloadSettings` has its own zod-validated route. */
const clientFields = {
  ...clientRow,
  name: str({ minLength: 1, maxLength: 120 }),
  /** `""` is accepted and stored as NULL by the route. */
  email: as(t.Union([t.String({ format: "email" }), t.Literal("")])),
  goals: str({ maxLength: 2000 }),
  limitations: str({ maxLength: 2000 }),
  sessionsPerWeek: as(IsoWeekday),
  trainingDays: as(t.Array(IsoWeekday, { uniqueItems: true })),
  cardioTarget: as(t.Object({ unit: oneOf(CARDIO_TARGET_UNITS), value: t.Integer({ minimum: 1, maximum: 10000 }) })),
  cardioDays: as(t.Array(IsoWeekday, { uniqueItems: true, maxItems: 7 })),
  longRunDay: as(IsoWeekday),
  oneRepMaxes: as(OneRepMaxes),
  birthDate: as(Day),
  bodyweightKg: as(t.Number({ minimum: BODYWEIGHT_KG_RANGE.min, maximum: BODYWEIGHT_KG_RANGE.max })),
  heightCm: as(t.Number({ minimum: HEIGHT_CM_RANGE.min, maximum: HEIGHT_CM_RANGE.max })),
  startedOn: as(Day),
  phone: str({ maxLength: PHONE_MAX }),
};

export const ClientInsert = createInsertSchema(clients, clientFields);
export const ClientUpdate = createUpdateSchema(clients, clientFields);
const ClientSelect = createSelectSchema(clients, clientRow);

/** Optional client fields a trainer sets on create and edit. */
const clientWritable = [
  "email",
  "goals",
  "limitations",
  "sessionsPerWeek",
  "trainingDays",
  "cardioTarget",
  "cardioDays",
  "longRunDay",
  "oneRepMaxes",
  "experience",
  "birthDate",
  "sex",
  "bodyweightKg",
  "heightCm",
  "startedOn",
  "phone",
] as const;

export const ClientModel = {
  create: t.Object({
    ...spread(t.Pick(ClientInsert, ["name"])),
    ...spread(t.Pick(ClientUpdate, clientWritable)),
  }),
  update: t.Pick(ClientUpdate, ["name", "status", ...clientWritable]),
  /** `clientDto`: the row plus the deload rule that applies to it. */
  dto: t.Object({ ...spread(ClientSelect), effectiveDeload: t.Unsafe<DeloadSettings>(t.Any()) }),
};
