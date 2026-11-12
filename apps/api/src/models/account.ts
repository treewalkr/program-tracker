/** Account — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { TrainerUpdate } from "./shared";

const TrainerAiMode = t.Required(t.Pick(TrainerUpdate, ["feedbackAiMode"]));

export const AccountModel = {
  feedbackEmails: TrainerUpdate.properties.feedbackEmails,
  /** Required, with no implicit default: an empty body is a 422, not "off". */
  feedbackAiMode: t.Object({ mode: TrainerAiMode.properties.feedbackAiMode }),
};
