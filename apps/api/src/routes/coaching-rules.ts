import { Elysia, t } from "elysia";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, aiGenerations, chatMessages, clients, coachingRules, llmFeedback } from "@pt/db";
import { anchorText } from "@pt/shared";
import { trainerContext } from "../lib/trainer-context";
import { extractRule, linkSourceNotes, sourceNotes } from "../lib/coaching-rules";
import { toRuleDto } from "../lib/notes";
import { CoachingRuleModel, RuleScope } from "../models/coaching-rules";


async function clientNames(trainerId: string): Promise<Map<string, string>> {
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.trainerId, trainerId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function ruleDto(id: string) {
  const [rule] = await db.select().from(coachingRules).where(eq(coachingRules.id, id));
  if (!rule) return null;
  const [client] = rule.clientId ? await db.select({ name: clients.name }).from(clients).where(eq(clients.id, rule.clientId)) : [];
  return toRuleDto(rule, client?.name ?? null);
}

/**
 * Coaching rules (§10): rules learned from the trainer's notes, plus their
 * own. Proposed rules wait for confirm/dismiss; only active rules reach a
 * prompt; retired rules stay for the record.
 */
export const coachingRuleRoutes = new Elysia({ prefix: "/v1/ai/rules", tags: ["ai"] })
  .use(trainerContext)
  .get(
    "/",
    async ({ trainerId }) => {
      const rows = await db
        .select()
        .from(coachingRules)
        .where(eq(coachingRules.trainerId, trainerId))
        .orderBy(desc(coachingRules.createdAt));
      const names = await clientNames(trainerId);
      const notes = await sourceNotes([...new Set(rows.flatMap((r) => r.sourceFeedbackIds))]);
      return {
        rules: rows.map((r) => ({
          ...toRuleDto(r, r.clientId ? (names.get(r.clientId) ?? null) : null),
          sources: r.sourceFeedbackIds.flatMap((id) => {
            const n = notes.get(id);
            return n
              ? [{ id: n.id, anchorText: anchorText(n.anchor), comment: n.comment, correction: n.correction, createdAt: n.createdAt.toISOString() }]
              : [];
          }),
        })),
      };
    },
    { detail: { summary: "All coaching rules, newest first, with the notes they came from" } }
  )
  .post(
    "/",
    async ({ body, status, trainerId }) => {
      const [rule] = await db
        .insert(coachingRules)
        .values({
          trainerId,
          clientId: body.clientId ?? null,
          text: body.text.trim(),
          category: body.category ?? "style",
          status: "active",
          source: "manual",
        })
        .returning();
      return status(201, (await ruleDto(rule.id))!);
    },
    {
      body: CoachingRuleModel.create,
      detail: { summary: "Write a rule by hand (active at once)" },
    }
  )
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      const [before] = await db.select().from(coachingRules).where(eq(coachingRules.id, params.id));
      if (!before) return status(404, { error: "rule not found" });
      const [after] = await db
        .update(coachingRules)
        .set({
          ...(body.text !== undefined ? { text: body.text.trim() } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(coachingRules.id, params.id))
        .returning();
      if (before.status === "proposed" && after.status === "active") await linkSourceNotes(after);
      return (await ruleDto(after.id))!;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: CoachingRuleModel.update,
      detail: { summary: "Edit text, switch scope, retire or reactivate a rule" },
    }
  )
  /** "Keep for: this client / always" on a learned rule. */
  .post(
    "/:id/confirm",
    async ({ params, body, status }) => {
      const [rule] = await db.select().from(coachingRules).where(eq(coachingRules.id, params.id));
      if (!rule) return status(404, { error: "rule not found" });
      if (rule.status !== "proposed") return status(409, { error: `rule is ${rule.status}, not proposed` });
      const clientId = body.scope === "always" ? null : (body.clientId ?? rule.clientId);
      if (body.scope === "client" && !clientId) return status(422, { error: "which client? pass clientId" });
      const [active] = await db
        .update(coachingRules)
        .set({
          status: "active",
          clientId,
          ...(body.text ? { text: body.text.trim() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(coachingRules.id, rule.id))
        .returning();
      await linkSourceNotes(active);
      return (await ruleDto(active.id))!;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: CoachingRuleModel.confirm,
      detail: { summary: "Confirm a proposed rule — it reaches prompts from now on" },
    }
  )
  .post(
    "/:id/dismiss",
    async ({ params, status }) => {
      const [rule] = await db
        .update(coachingRules)
        .set({ status: "retired", updatedAt: new Date() })
        .where(and(eq(coachingRules.id, params.id), eq(coachingRules.status, "proposed")))
        .returning();
      if (!rule) return status(409, { error: "only a proposed rule can be dismissed" });
      return (await ruleDto(rule.id))!;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: { summary: "Dismiss a proposed rule (kept as retired, never prompted)" },
    }
  )
  .delete(
    "/:id",
    async ({ params, status }) => {
      const [deleted] = await db.delete(coachingRules).where(eq(coachingRules.id, params.id)).returning();
      if (!deleted) return status(404, { error: "rule not found" });
      return status(204);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  /**
   * "Remember this for next time?" after a chat-built revision: the trainer's
   * request (and the built proposal) become a proposed rule.
   */
  .post(
    "/extract",
    async ({ body, status, trainerId }) => {
      const [gen] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, body.generationId));
      if (!gen || !gen.revisionMessage || !gen.parentGenerationId) {
        return status(422, { error: "only a revised draft can teach a rule" });
      }
      const [proposal] = await db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.clientId, gen.clientId), eq(chatMessages.kind, "proposal")))
        .orderBy(desc(chatMessages.createdAt))
        .limit(50)
        .then((rows) => rows.filter((r) => r.proposal?.builtGenerationId === gen.id));
      const correction = proposal?.proposal
        ? proposal.proposal.changes
            .map((c) => `${c.kind}${c.from ? ` ${c.from}` : ""}${c.to && c.to !== c.from ? ` → ${c.to}` : ""}${c.detail ? ` (${c.detail})` : ""}`)
            .join("; ")
        : null;
      const revised = await db
        .select({ id: llmFeedback.id, payload: llmFeedback.payload })
        .from(llmFeedback)
        .where(
          and(
            eq(llmFeedback.subjectKind, "generation"),
            eq(llmFeedback.subjectId, gen.parentGenerationId),
            eq(llmFeedback.signal, "draft_revised")
          )
        )
        .orderBy(asc(llmFeedback.createdAt));
      const feedbackIds = revised.filter((r) => r.payload?.childGenerationId === gen.id).map((r) => r.id);
      const res = await extractRule({
        trainerId,
        clientId: gen.clientId,
        scope: body.scope ?? "client",
        source: "chat",
        anchor: null,
        comment: gen.revisionMessage,
        correction,
        feedbackIds,
        providerId: gen.providerId,
        model: gen.model,
      });
      if (!res.ok) return status(res.status as 502, { error: res.error });
      return status(201, (await ruleDto(res.rule.id))!);
    },
    {
      body: t.Object({ generationId: t.String({ format: "uuid" }), scope: t.Optional(RuleScope) }),
      detail: { summary: "Propose a rule from a chat-built revision" },
    }
  );

