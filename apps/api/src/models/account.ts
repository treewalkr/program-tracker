/** Account — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
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
