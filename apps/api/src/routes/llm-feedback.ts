import { Elysia, t, type Static } from "elysia";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, llmFeedback } from "@pt/db";
import {
  LLM_EXPLICIT_SIGNALS,
  LLM_NOTE_SIGNAL,
  noteRevisionText,
  type LlmReasonTag,
  type NoteAnchor,
} from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { recordFeedback, subjectOwner } from "../lib/llm-feedback";
import { activeRuleOf, afterNote, toNoteDto, toRuleDto } from "../lib/notes";
import { runRevision } from "../lib/revision";
import { ContextError } from "../ai/runtime";
import { LlmFeedbackModel } from "../models/llm-feedback";
import { spread } from "../utility";

// The note anchor is a JSON document mirrored here; `satisfies` keeps it in step with
// @pt/shared. Row fields come from the llm_feedback table (models.ts).
const Anchor = t.Union([
  t.Object({
    type: t.Literal("slot"),
    week: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
    session: t.String({ maxLength: 200 }),
    sessionIndex: t.Integer({ minimum: 0 }),
    exerciseIndex: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
    exerciseId: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
    exerciseName: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
    setIndex: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
  }),
  t.Object({
    type: t.Literal("text"),
    quote: t.String({ minLength: 1, maxLength: 2000 }),
    start: t.Integer({ minimum: 0 }),
    end: t.Integer({ minimum: 0 }),
  }),
]);
true satisfies Static<typeof Anchor> extends NoteAnchor ? true : false;

const toVerdict = (r: typeof llmFeedback.$inferSelect) => ({
  id: r.id,
  subjectKind: r.subjectKind,
  subjectId: r.subjectId,
  signal: r.signal as "thumbs_up" | "thumbs_down",
  reasonTags: r.reasonTags as LlmReasonTag[],
  comment: r.comment,
  correction: r.correction,
  scope: r.scope ?? "once",
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
      if (explicit && body.violatedRuleId && !(await activeRuleOf(trainerId, body.violatedRuleId))) {
        return status(404, { error: "rule not found" });
      }
      const row = await recordFeedback({
        trainerId,
        clientId: owner.clientId,
        subjectKind: body.subjectKind,
        subjectId: body.subjectId,
        signal: body.signal,
        reasonTags: explicit ? (body.reasonTags ?? []) : [],
        comment: explicit ? (body.comment ?? null) : null,
        correction: explicit ? (body.correction ?? null) : null,
        scope: explicit && (body.comment || body.correction) ? (body.scope ?? "once") : null,
        ruleId: explicit ? (body.violatedRuleId ?? null) : null,
      });
      if (!row) return status(500, { error: "feedback not saved" });
      const learned = explicit
        ? await afterNote(row, { trainerId, violatedRuleId: body.violatedRuleId, reasonTags: body.reasonTags })
        : { rule: null, ruleError: null };
      return status(201, {
        ...toVerdict(row),
        rule: learned.rule ? toRuleDto(learned.rule) : null,
        ruleError: learned.ruleError,
      });
    },
    {
      body: LlmFeedbackModel.verdict,
      detail: { summary: "Rate an AI output (thumbs, reasons, comment, what instead) or record a UI-side signal" },
    }
  )
  /** Take a 👍/👎 back: the trainer's thumbs rows on the subject go. Rules it already proposed stay. */
  .delete(
    "/",
    async ({ query, status, trainerId }) => {
      const owner = await subjectOwner(query.subjectKind, query.subjectId);
      if (!owner || owner.trainerId !== trainerId) return status(404, { error: "subject not found" });
      await db
        .delete(llmFeedback)
        .where(
          and(
            eq(llmFeedback.trainerId, trainerId),
            eq(llmFeedback.subjectKind, query.subjectKind),
            eq(llmFeedback.subjectId, query.subjectId),
            inArray(llmFeedback.signal, [...LLM_EXPLICIT_SIGNALS])
          )
        );
      return status(204);
    },
    {
      query: LlmFeedbackModel.subject,
      detail: { summary: "Remove the thumbs verdict on an AI output" },
    }
  )
  /** A note pinned to one part of an output (an exercise, a session, a quoted sentence). */
  .post(
    "/notes",
    async ({ body, status, trainerId }) => {
      const owner = await subjectOwner(body.subjectKind, body.subjectId);
      if (!owner || owner.trainerId !== trainerId) return status(404, { error: "subject not found" });
      if (!body.comment.trim() && !body.correction?.trim()) return status(422, { error: "write a note or what to do instead" });
      if (body.violatedRuleId && !(await activeRuleOf(trainerId, body.violatedRuleId))) {
        return status(404, { error: "rule not found" });
      }
      const row = await recordFeedback({
        trainerId,
        clientId: owner.clientId,
        subjectKind: body.subjectKind,
        subjectId: body.subjectId,
        signal: LLM_NOTE_SIGNAL,
        reasonTags: body.reasonTags ?? [],
        comment: body.comment,
        correction: body.correction ?? null,
        scope: body.scope ?? "once",
        anchor: body.anchor,
        ruleId: body.violatedRuleId ?? null,
      });
      if (!row) return status(500, { error: "note not saved" });
      const learned = await afterNote(row, { trainerId, violatedRuleId: body.violatedRuleId });
      return status(201, {
        note: toNoteDto(row),
        rule: learned.rule ? toRuleDto(learned.rule) : null,
        ruleError: learned.ruleError,
      });
    },
    {
      body: t.Object({ ...spread(LlmFeedbackModel.note), anchor: Anchor }),
      detail: { summary: "Pin a note to part of an AI output; scope client/always proposes a coaching rule" },
    }
  )
  .get(
    "/notes",
    async ({ query, trainerId }) => {
      const ids = query.subjectIds.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
      if (ids.length === 0) return { notes: [] };
      const rows = await db
        .select()
        .from(llmFeedback)
        .where(
          and(
            eq(llmFeedback.trainerId, trainerId),
            inArray(llmFeedback.subjectId, ids),
            eq(llmFeedback.signal, LLM_NOTE_SIGNAL)
          )
        )
        .orderBy(llmFeedback.createdAt);
      return { notes: rows.map(toNoteDto) };
    },
    {
      query: t.Object({ subjectIds: t.String({ maxLength: 8000 }) }),
      detail: { summary: "Notes pinned to these subjects, oldest first" },
    }
  )
  /** "Apply to this draft": the note (anchor as text) goes down the normal revision path. */
  .post(
    "/notes/:id/apply",
    async ({ params, status }) => {
      const [note] = await db.select().from(llmFeedback).where(eq(llmFeedback.id, params.id));
      if (!note || note.signal !== LLM_NOTE_SIGNAL) return status(404, { error: "note not found" });
      if (note.subjectKind !== "generation") return status(422, { error: "only notes on a draft can be applied" });
      try {
        const res = await runRevision(note.subjectId, noteRevisionText(note), { lockPhasing: true });
        if (!res.ok) return status(res.status, { error: res.error });
        const code = res.generation.status === "validated" ? 201 : res.generation.status === "cancelled" ? 200 : 502;
        return status(code, res.generation);
      } catch (err) {
        if (err instanceof ContextError) return status(err.status as 400, { error: err.message });
        throw err;
      }
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: { summary: "Revise the noted draft with the note as the request" },
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
