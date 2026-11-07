import { Elysia, t, type Static } from "elysia";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, llmFeedback } from "@pt/db";
import { LLM_EXPLICIT_SIGNALS, type LlmClientSignal, type LlmReasonTag } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { recordFeedback, subjectOwner } from "../lib/llm-feedback";

// Written-out literal unions (not built from the shared arrays) so the types
// survive Eden; the `satisfies` lines keep them in step with @pt/shared.
const SubjectKind = t.Union([t.Literal("chat_message"), t.Literal("generation"), t.Literal("client_message")]);
const Signal = t.Union([
  t.Literal("thumbs_up"),
  t.Literal("thumbs_down"),
  t.Literal("proposal_adjusted"),
  t.Literal("client_message_copied"),
]);
const ReasonTag = t.Union([
  t.Literal("ignored_limitation"),
  t.Literal("wrong_exercise"),
  t.Literal("volume_off"),
  t.Literal("load_off"),
  t.Literal("invented_number"),
  t.Literal("off_topic"),
  t.Literal("tone"),
  t.Literal("too_long"),
  t.Literal("format"),
]);
true satisfies LlmClientSignal extends Static<typeof Signal> ? true : false;
true satisfies LlmReasonTag extends Static<typeof ReasonTag> ? true : false;

const toVerdict = (r: typeof llmFeedback.$inferSelect) => ({
  id: r.id,
  subjectKind: r.subjectKind,
  subjectId: r.subjectId,
  signal: r.signal as "thumbs_up" | "thumbs_down",
  reasonTags: r.reasonTags as LlmReasonTag[],
  comment: r.comment,
  createdAt: r.createdAt.toISOString(),
});

/**
 * Trainer verdicts on AI output: 👍/👎 with optional reason chips and a
 * comment, plus the UI-only implicit signals (Adjust on a proposal, Copy on a
 * client message). Insert-only — the latest explicit verdict per subject wins.
 */
export const llmFeedbackRoutes = new Elysia({ prefix: "/v1/ai/feedback", tags: ["ai"] })
  .use(trainerContext)
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const owner = await subjectOwner(body.subjectKind, body.subjectId);
      if (!owner || owner.trainerId !== trainerId) return status(404, { error: "subject not found" });
      const explicit = body.signal === "thumbs_up" || body.signal === "thumbs_down";
      const row = await recordFeedback({
        trainerId,
        clientId: owner.clientId,
        subjectKind: body.subjectKind,
        subjectId: body.subjectId,
        signal: body.signal,
        reasonTags: explicit ? (body.reasonTags ?? []) : [],
        comment: explicit ? (body.comment ?? null) : null,
      });
      if (!row) return status(500, { error: "feedback not saved" });
      return status(201, toVerdict(row));
    },
    {
      body: t.Object({
        subjectKind: SubjectKind,
        subjectId: t.String({ format: "uuid" }),
        signal: Signal,
        reasonTags: t.Optional(t.Array(ReasonTag, { maxItems: 9, uniqueItems: true })),
        comment: t.Optional(t.String({ maxLength: 2000 })),
      }),
      detail: { summary: "Rate an AI output (thumbs, reasons, comment) or record a UI-side signal" },
    }
  )
  .get(
    "/",
    async ({ query, trainerId }) => {
      const ids = query.subjectIds.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
      if (ids.length === 0) return { verdicts: [] };
      const rows = await db
        .select()
        .from(llmFeedback)
        .where(
          and(
            eq(llmFeedback.trainerId, trainerId),
            inArray(llmFeedback.subjectId, ids),
            inArray(llmFeedback.signal, [...LLM_EXPLICIT_SIGNALS])
          )
        )
        .orderBy(desc(llmFeedback.createdAt));
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!latest.has(r.subjectId)) latest.set(r.subjectId, r);
      return { verdicts: [...latest.values()].map(toVerdict) };
    },
    {
      query: t.Object({ subjectIds: t.String({ maxLength: 8000 }) }),
      detail: { summary: "Latest thumbs verdict per subject" },
    }
  );
