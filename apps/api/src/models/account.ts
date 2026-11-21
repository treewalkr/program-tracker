/** Account — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { DISTANCE_UNITS, WEIGHT_UNITS, type DisplayUnits } from "@pt/shared";
import { oneOf } from "./shared";
import { TrainerUpdate } from "./shared";
import { nonNull } from "../utility";

const TrainerAiMode = t.Required(t.Pick(TrainerUpdate, ["feedbackAiMode"]));
const TrainerWeeks = t.Required(t.Pick(TrainerUpdate, ["lastWeeksChoice"]));

export const AccountModel = {
  feedbackEmails: TrainerUpdate.properties.feedbackEmails,
  /** Required, with no implicit default: an empty body is a 422, not "off". */
  feedbackAiMode: t.Object({ mode: TrainerAiMode.properties.feedbackAiMode }),
  /** The generate page's Weeks setting (stored as `lastWeeksChoice`). */
  weeksChoice: t.Object({ choice: nonNull(TrainerWeeks.properties.lastWeeksChoice) }),
};

/** kg/lb and km/mi. The body is the jsonb `display_units` document, checked by the shared zod DisplayUnits. */
export const UnitsModel = {
  body: t.Unsafe<DisplayUnits>(t.Any()),
  dto: t.Object({ weight: oneOf(WEIGHT_UNITS), distance: oneOf(DISTANCE_UNITS) }),
};
