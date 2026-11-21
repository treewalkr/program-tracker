/** Session logs — the review body and response, derived from the Drizzle table. See ./shared.ts. */
import { t } from "elysia";
import { sessionLogs } from "@pt/db/schema";
import { createSelectSchema, createUpdateSchema } from "../utility";
import { str } from "./shared";

/** Most characters of coach feedback on one log. */
export const TRAINER_FEEDBACK_MAX = 2000;

const LogUpdate = createUpdateSchema(sessionLogs, {
  trainerFeedback: str({ maxLength: TRAINER_FEEDBACK_MAX }),
});
const LogSelect = createSelectSchema(sessionLogs);

export const LogModel = {
  /** `reviewed` stamps (or clears) the review; `feedback` ← trainer_feedback, null clears it, absent keeps it. */
  review: t.Object({
    reviewed: t.Boolean(),
    feedback: LogUpdate.properties.trainerFeedback,
  }),
  reviewed: t.Pick(LogSelect, ["id", "reviewedAt", "reviewedBy", "trainerFeedback"]),
};
