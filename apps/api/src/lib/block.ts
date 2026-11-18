import { eq } from "drizzle-orm";
import { db, aiGenerations, programs, trainers, type AiGenerationRow } from "@pt/db";
import { DEFAULT_PROVIDER_ID, MAX_AI_BLOCK_WEEKS, blockDraftSchema, isAlternating } from "@pt/shared";
import { callLlm, contextSnapshot, isMockRuntime } from "../ai/llm";
import { buildGenerationMessages } from "../ai/prompt";
import { mockBlockDraft } from "../ai/mock";
import { providerRuntime, resolveEffort } from "../ai/runtime";
import { deregisterGeneration, registerGeneration } from "../ai/cancellation";
import { loadContext } from "./context";
import { settleGeneration } from "./settle-generation";
import { recordRegenerated } from "./llm-feedback";

export interface BlockBody {
  clientId: string;
  basedOnProgramId?: string | null;
  providerId?: string;
  model?: string;
  effort?: string;
  instructions?: string;
  direction?: string;
  /** Weeks to write (the trainer's field wins over the AI's plan). */
  plannedWeeks?: number;
  /** Odd weeks A, even weeks B. */
  alternate?: boolean;
}

/**
 * A new block draft (FB-013): the whole block, every week, in one call — the
 * trainer's length and Weeks choice, else the current program's. Throws
 * ContextError for an unknown provider, model or effort.
 */
export async function startBlock(trainerId: string, body: BlockBody): Promise<{ code: 200 | 201 | 502; row: AiGenerationRow }> {
  const ctx = await loadContext(trainerId, body.clientId, body.basedOnProgramId ?? null);
  const rt = providerRuntime(body.providerId ?? DEFAULT_PROVIDER_ID, body.model);
  const effort = resolveEffort(rt, body.effort);
  // The trainer's block length and Weeks choice; else the current program's.
  const [current] = body.basedOnProgramId
    ? await db.select({ sessions: programs.sessions, phasing: programs.phasing }).from(programs).where(eq(programs.id, body.basedOnProgramId))
    : [];
  const block = {
    weeks: body.plannedWeeks ?? Math.min(MAX_AI_BLOCK_WEEKS, Math.max(2, current?.phasing?.plannedWeeks ?? current?.sessions.length ?? 4)),
    alternate: body.alternate ?? (current ? isAlternating(current.sessions) : false),
  };
  // The generate page's choice becomes the trainer's default for the next block.
  if (body.alternate !== undefined) {
    await db.update(trainers).set({ lastWeeksChoice: body.alternate ? "alternate" : "same" }).where(eq(trainers.id, trainerId));
  }
  const messages = buildGenerationMessages({
    ...ctx,
    block,
    direction: body.direction ?? null,
    trainerInstructions: body.instructions ?? "",
  });

  const [generation] = await db
    .insert(aiGenerations)
    .values({
      trainerId,
      clientId: body.clientId,
      basedOnProgramId: body.basedOnProgramId ?? null,
      kind: "block",
      direction: body.direction ?? null,
      instructions: body.instructions ?? null,
      providerId: body.providerId ?? DEFAULT_PROVIDER_ID,
      model: rt.model,
      effort,
      status: "pending",
      exampleProgramIds: ctx.examples.map((e) => e.programId),
    })
    .returning();

  await recordRegenerated(trainerId, body.clientId, "block", generation.id);
  const ac = registerGeneration(generation.id);
  try {
    // Call + validate, with exactly one retry on validation failure.
    const out = await callLlm({
      purpose: "block_generate",
      builder: "buildGenerationMessages",
      links: { trainerId, clientId: body.clientId, generationId: generation.id },
      context: contextSnapshot(ctx, {
        basedOnProgramId: body.basedOnProgramId ?? null,
        direction: body.direction ?? null,
        trainerInstructions: body.instructions ?? "",
        block,
      }),
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
      rt,
      effort,
      signal: ac.signal,
      mode: "json",
      long: true,
      // Every week, the client's exercise session count, letters odd A / even B, B ≠ A.
      schema: blockDraftSchema({
        plannedWeeks: block.weeks,
        alternate: block.alternate,
        exerciseSessions: isMockRuntime(rt) ? null : ctx.client.sessionsPerWeek ?? null,
      }),
      mock: () => JSON.stringify(mockBlockDraft({ plannedWeeks: block.weeks, alternate: block.alternate })),
    });
    return await settleGeneration(generation.id, out);
  } finally {
    deregisterGeneration(generation.id);
  }
}
