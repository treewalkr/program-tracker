import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, clients, coachingRules, llmCalls, llmFeedback, type CoachingRuleRow, type LlmFeedbackRow } from "@pt/db";
import {
  COACHING_RULE_CATEGORIES,
  COACHING_RULES_PROMPT_LIMIT,
  DEFAULT_PROVIDER_ID,
  mockExtractRule,
  type CoachingRuleSource,
  type NoteAnchor,
} from "@pt/shared";
import { callLlm } from "../ai/llm";
import { buildRuleExtractMessages, type CoachingRulePrompt } from "../ai/prompt";
import { ContextError, providerRuntime } from "../ai/runtime";

/**
 * Coaching rules (docs/llm-logging-plan.md §10): standing rules learned from
 * the trainer's detailed notes. Extraction only ever proposes; a rule reaches
 * a prompt once the trainer confirms it (status "active").
 */

/** Active rules for one client's prompt: client rules first, then newest, capped. */
export async function loadActiveRules(trainerId: string, clientId: string | null): Promise<CoachingRulePrompt[]> {
  const rows = await db
    .select({ id: coachingRules.id, text: coachingRules.text, clientId: coachingRules.clientId })
    .from(coachingRules)
    .where(
      and(
        eq(coachingRules.trainerId, trainerId),
        eq(coachingRules.status, "active"),
        clientId ? or(isNull(coachingRules.clientId), eq(coachingRules.clientId, clientId)) : isNull(coachingRules.clientId)
      )
    )
    .orderBy(sql`${coachingRules.clientId} is null`, desc(coachingRules.createdAt))
    .limit(COACHING_RULES_PROMPT_LIMIT);
  return rows.map((r) => ({ id: r.id, text: r.text, scope: r.clientId ? "client" : "always" }));
}

/** A note says this active rule was broken. */
export async function bumpViolated(ruleId: string): Promise<void> {
  try {
    await db
      .update(coachingRules)
      .set({ violatedCount: sql`${coachingRules.violatedCount} + 1` })
      .where(and(eq(coachingRules.id, ruleId), eq(coachingRules.status, "active")));
  } catch (err) {
    console.error("[coaching-rules] failed to bump violated_count:", err);
  }
}

const Extracted = z.object({
  rule: z.string().trim().min(3).max(400),
  category: z.enum(COACHING_RULE_CATEGORIES).catch("style"),
  appliesTo: z.enum(["client", "always"]).catch("client"),
});

export interface ExtractInput {
  trainerId: string;
  /** The client the note was about (null when none). */
  clientId: string | null;
  /** Where the rule applies: this client, or all clients. */
  scope: "client" | "always";
  source: Exclude<CoachingRuleSource, "manual">;
  anchor: NoteAnchor | null;
  comment: string | null;
  correction: string | null;
  reasonTags?: string[];
  subjectText?: string | null;
  feedbackIds: string[];
  /** Provider of the output being judged; extraction follows it (mock stays mock). */
  providerId?: string | null;
  model?: string | null;
  turnId?: string;
}

export type ExtractResult = { ok: true; rule: CoachingRuleRow } | { ok: false; status: number; error: string };

/** rule_extract call → a `proposed` rule. Never active: the trainer confirms first. */
export async function extractRule(input: ExtractInput): Promise<ExtractResult> {
  let rt: ReturnType<typeof providerRuntime>;
  try {
    const providerId = input.providerId ?? DEFAULT_PROVIDER_ID;
    rt = providerRuntime(providerId, providerId === "mock" ? undefined : (input.model ?? undefined));
  } catch (err) {
    if (!(err instanceof ContextError)) throw err;
    // The judged output's model is gone from config — fall back to the default.
    try {
      rt = providerRuntime(DEFAULT_PROVIDER_ID);
    } catch (fallback) {
      if (fallback instanceof ContextError) return { ok: false, status: fallback.status, error: fallback.message };
      throw fallback;
    }
  }

  const [client] = input.clientId
    ? await db.select({ name: clients.name }).from(clients).where(eq(clients.id, input.clientId))
    : [];
  const existing = await loadActiveRules(input.trainerId, input.clientId);
  const ctx = {
    clientName: client?.name ?? null,
    scope: input.scope,
    anchor: input.anchor,
    subjectText: input.subjectText ?? null,
    comment: input.comment,
    correction: input.correction,
    reasonTags: input.reasonTags ?? [],
    existingRules: existing.map((r) => r.text),
  };
  const messages = buildRuleExtractMessages(ctx);
  const out = await callLlm({
    purpose: "rule_extract",
    builder: "buildRuleExtractMessages",
    links: { trainerId: input.trainerId, clientId: input.clientId },
    context: { ...ctx, feedbackIds: input.feedbackIds, existingRuleIds: existing.map((r) => r.id) },
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    rt,
    temperature: 0.2,
    mode: "json",
    schema: Extracted,
    turnId: input.turnId,
    mock: () => JSON.stringify(mockExtractRule({ ...input, scope: input.scope })),
  });
  if (!out.ok) {
    const error = out.kind === "provider" ? out.error.message : out.kind === "validation" ? `bad answer from the model: ${out.error}` : "aborted";
    return { ok: false, status: 502, error };
  }

  const [rule] = await db
    .insert(coachingRules)
    .values({
      trainerId: input.trainerId,
      // The trainer's chosen scope wins over the model's guess.
      clientId: input.scope === "client" ? input.clientId : null,
      text: out.data.rule,
      category: out.data.category,
      status: "proposed",
      source: input.source,
      sourceFeedbackIds: input.feedbackIds,
    })
    .returning();
  return { ok: true, rule };
}

/** On confirm: the notes that produced the rule now point at it (only where they point at nothing yet). */
export async function linkSourceNotes(rule: CoachingRuleRow): Promise<void> {
  if (rule.sourceFeedbackIds.length === 0) return;
  try {
    await db
      .update(llmFeedback)
      .set({ ruleId: rule.id })
      .where(and(inArray(llmFeedback.id, rule.sourceFeedbackIds), isNull(llmFeedback.ruleId)));
  } catch (err) {
    console.error("[coaching-rules] failed to link source notes:", err);
  }
}

/** Provider + model that produced the judged output, so extraction runs on the same one. */
export async function providerOfCall(callId: string | null): Promise<{ providerId: string; model: string } | null> {
  if (!callId) return null;
  const [row] = await db
    .select({ providerId: llmCalls.providerId, model: llmCalls.model })
    .from(llmCalls)
    .where(eq(llmCalls.id, callId));
  return row ?? null;
}

/** Source notes for the rules page. */
export async function sourceNotes(ids: string[]): Promise<Map<string, LlmFeedbackRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(llmFeedback).where(inArray(llmFeedback.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
