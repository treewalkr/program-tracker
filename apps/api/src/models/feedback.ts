/** Feedback — request/response schemas derived from the Drizzle table(s). See ./shared.ts. */
import { t } from "elysia";
import { feedbackComments, feedbackItems } from "@pt/db/schema";
import { FEEDBACK_STATUSES } from "@pt/shared";
import { createInsertSchema, createUpdateSchema, nonNull } from "../utility";
import { str, oneOf, as } from "./shared";

const FeedbackText = { maxLength: 5000 };
const GITHUB_PR_URL = "^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$";
const feedbackItemFields = {
  comment: str({ minLength: 1, ...FeedbackText }),
  /** The fix agent's pull request — a GitHub PR URL. */
  fixPr: str({ pattern: GITHUB_PR_URL, maxLength: 300 }),
  triageNote: str(FeedbackText),
  status: as(oneOf(FEEDBACK_STATUSES)),
};
const FeedbackItemInsert = createInsertSchema(feedbackItems, feedbackItemFields);
const FeedbackItemUpdate = createUpdateSchema(feedbackItems, feedbackItemFields);
const FeedbackCommentUpdate = createUpdateSchema(feedbackComments, { body: str(FeedbackText) });
const FeedbackReplyText = t.Required(t.Pick(FeedbackCommentUpdate, ["body"]));
const FeedbackItemValues = t.Required(t.Pick(FeedbackItemUpdate, ["fixPr"]));

/** Multipart images, the captured context and edit bookkeeping stay in the route: not columns. */
export const FeedbackModel = {
  comment: FeedbackItemInsert.properties.comment,
  triage: t.Pick(FeedbackItemUpdate, ["status", "triageNote"]),
  /** Reply text; the column is null only for status entries. */
  replyBody: nonNull(FeedbackReplyText.properties.body),
  /** Agent API: stored as `fixPr`. */
  fixPr: t.Object({ url: nonNull(FeedbackItemValues.properties.fixPr) }),
};
