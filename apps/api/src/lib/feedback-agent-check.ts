import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, feedbackItems } from "@pt/db";
import {
  AGENT_VERDICTS,
  agentCheckBasis,
  feedbackItemMarkdown,
  type FeedbackAgentCheck,
  type FeedbackItem,
} from "@pt/shared";
import { callLlm } from "../ai/llm";
import { ContextError, providerRuntime, resolveEffort } from "../ai/runtime";

/**
 * Agent-readiness check: an LLM reads a ticket exactly as the coding agent
 * would (the export Markdown) and judges whether an agent could fix it
 * unattended. The verdict is stored on the ticket; it goes stale when the
 * comment, triage note or replies change.
 */

const Verdict = z.object({
  verdict: z.enum(AGENT_VERDICTS),
  summary: z.string().min(1).max(400),
  plan: z.array(z.string().min(1).max(300)).max(8).optional(),
  questions: z.array(z.string().min(1).max(300)).max(5).optional(),
  risk: z.enum(["low", "medium", "high"]),
});
type Verdict = z.infer<typeof Verdict>;

export const AGENT_CHECK_SYSTEM = `You triage UI feedback tickets for a coding agent that will fix them unattended, with repo access but no way to ask anyone.

The ticket is a fitness-coaching web app (SvelteKit + Elysia API). Trainers pin comments to UI elements; the owner may add a triage note, which outranks the comment.

Judge whether the agent can fix this ticket without a human:
- "ready": the problem and the wanted outcome are both clear, the place in the code is known or easy to find (source file, route, visible text), and the change is small and self-contained (copy, style, layout, a contained bug, a small UI behaviour).
- "needs_info": it could be agent work, but something is missing or ambiguous — what "better" means, which of several readings, unanswered questions in the thread, or a comment that conflicts with the triage note.
- "not_for_agent": a product or design decision, a large or cross-cutting feature, data migrations, auth/billing/privacy, or anything needing taste the ticket doesn't spell out.

Rules:
- Comments may be in Thai or English. Write your answer in English.
- Screenshots exist but you cannot see them; don't count them as missing information.
- Never invent requirements. If you have to guess what the trainer wants, it is not "ready".
- plan: 1–6 concrete steps naming files or components when known; empty unless verdict is "ready".
- questions: what to ask the reporter or owner; empty when verdict is "ready".
- risk: how likely an unattended fix is to break something or miss the point.

Reply with JSON only:
{"verdict":"ready|needs_info|not_for_agent","summary":"one sentence","plan":["…"],"questions":["…"],"risk":"low|medium|high"}`;

/** Canned verdict for the mock provider: ready only with a source location and a triage note. */
function mockVerdict(item: FeedbackItem): Verdict {
  if (item.source && item.triageNote)
    return {
      verdict: "ready",
      summary: `Apply the triage note to ${item.source.split(":")[0]}.`,
      plan: [`Open ${item.source}`, item.triageNote],
      questions: [],
      risk: "low",
    };
  return {
    verdict: "needs_info",
    summary: "The wanted outcome is not spelled out.",
    plan: [],
    questions: ["What should it look like or do instead?"],
    risk: "medium",
  };
}

/** Provider for checks: FEEDBACK_CHECK_PROVIDER, else the first one with a key. */
export function defaultCheckProvider(): string {
  if (process.env.FEEDBACK_CHECK_PROVIDER) return process.env.FEEDBACK_CHECK_PROVIDER;
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return "zai";
}

export type AgentCheckResult =
  | { ok: true; check: FeedbackAgentCheck }
  | { ok: false; status: number; error: string };

export async function runAgentCheck(
  item: FeedbackItem,
  opts: { trainerId: string; providerId?: string; model?: string; effort?: string },
): Promise<AgentCheckResult> {
  let rt: ReturnType<typeof providerRuntime>;
  let effort: string | undefined;
  try {
    rt = providerRuntime(opts.providerId ?? defaultCheckProvider(), opts.model);
    effort = rt.providerId === "mock" ? undefined : resolveEffort(rt, opts.effort);
  } catch (err) {
    if (err instanceof ContextError) return { ok: false, status: err.status, error: err.message };
    throw err;
  }

  const ticket = feedbackItemMarkdown({ ...item, agentCheck: null }, { imageUrl: () => null });
  const shots = [item.hasElementShot && "element", item.hasPageShot && "full page"].filter(Boolean);
  const out = await callLlm<Verdict>({
    purpose: "feedback_check",
    builder: "AGENT_CHECK_SYSTEM",
    links: { trainerId: opts.trainerId },
    context: { feedbackItemId: item.id, number: item.number, status: item.status },
    messages: [
      { role: "system", content: AGENT_CHECK_SYSTEM },
      {
        role: "user",
        content: `${ticket}\n\n${shots.length ? `(Screenshots attached for the agent: ${shots.join(", ")}.)` : "(No screenshots.)"}`,
      },
    ],
    rt,
    effort,
    temperature: 0.2,
    mode: "json",
    schema: Verdict,
    mock: () => JSON.stringify(mockVerdict(item)),
  });
  if (!out.ok) {
    const error =
      out.kind === "provider" ? out.error.message : out.kind === "validation" ? `bad answer from the model: ${out.error}` : "aborted";
    return { ok: false, status: 502, error };
  }

  const v = out.data;
  const check: FeedbackAgentCheck = {
    verdict: v.verdict,
    summary: v.summary,
    plan: v.verdict === "ready" ? (v.plan ?? []) : [],
    questions: v.verdict === "ready" ? [] : (v.questions ?? []),
    risk: v.risk,
    model: rt.model,
    checkedAt: new Date().toISOString(),
    basis: agentCheckBasis(item),
  };
  await db.update(feedbackItems).set({ agentCheck: check }).where(eq(feedbackItems.id, item.id));
  return { ok: true, check };
}
