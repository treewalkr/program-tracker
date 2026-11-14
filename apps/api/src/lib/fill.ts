import { eq } from "drizzle-orm";
import { db, aiGenerations, clients, exercises, programs, sessionLogs, type AiGenerationRow, type ProgramRow } from "@pt/db";
import {
  MAX_AI_BLOCK_WEEKS,
  ProgramWeeksDocument,
  blockDraftSchema,
  fillLockedWeeks,
  isAlternating,
  loggedWeeks,
  programWeekToDraftWeek,
  withLockedWeeks,
  type AiProgramDraft,
  type ProgramWeek,
} from "@pt/shared";
import { callLlm, contextSnapshot, isMockRuntime } from "../ai/llm";
import { buildFillMessages } from "../ai/prompt";
import { mockFillDraft } from "../ai/mock";
import { ContextError, providerRuntime, resolveEffort } from "../ai/runtime";
import { deregisterGeneration, registerGeneration } from "../ai/cancellation";
import { loadContext } from "./context";
import { settleGeneration } from "./settle-generation";
import { recordRegenerated } from "./llm-feedback";
import { toSignalProgram } from "./signals-service";
import { bindPendingExercises, replaceWeek } from "./draftToProgram";
import { ensureSessionTypes } from "./session-types";
import { loadRoleLabels } from "./role-labels";

/**
 * Fill with AI (FB-013). The trainer wrote the first week(s); the AI writes
 * every week after the last logged one (and after the first week of each
 * letter, so it has the trainer's routine to build on). The trainer's weeks
 * travel in the draft as `locked` weeks — no extra column — and are never
 * written back.
 */

/** Weeks of a program that have logs (by logged session, else by date). */
export async function programLoggedWeeks(p: ProgramRow): Promise<number[]> {
  const rows = await db
    .select({ programId: sessionLogs.programId, programSessionId: sessionLogs.programSessionId, date: sessionLogs.date })
    .from(sessionLogs)
    .where(eq(sessionLogs.programId, p.id));
  return loggedWeeks(toSignalProgram(p), rows);
}

export type FillStart =
  | { ok: false; status: 404 | 409 | 422; error: string }
  | { ok: true; code: 200 | 201 | 502; row: AiGenerationRow };

export async function startFill(
  trainerId: string,
  body: { clientId: string; basedOnProgramId: string; providerId?: string; model?: string; effort?: string; instructions?: string }
): Promise<FillStart> {
  const [program] = await db.select().from(programs).where(eq(programs.id, body.basedOnProgramId));
  if (!program || program.clientId !== body.clientId) return { ok: false, status: 404, error: "program not found" };
  if (program.status === "archived") return { ok: false, status: 409, error: "archived programs can't be filled" };
  const weeks = program.sessions;
  if (weeks.length > MAX_AI_BLOCK_WEEKS) {
    return { ok: false, status: 422, error: `AI fills blocks of at most ${MAX_AI_BLOCK_WEEKS} weeks` };
  }
  const locked = fillLockedWeeks(weeks, await programLoggedWeeks(program));
  if (locked.length >= weeks.length) return { ok: false, status: 422, error: "nothing left to fill: every week is yours or logged" };

  const alternate = isAlternating(weeks);
  const lockedWeeks = weeks.filter((w) => locked.includes(w.week)).map((w) => programWeekToDraftWeek(w, { locked: true }));
  const block = { weeks: weeks.length, alternate, lockedWeeks: locked };
  const ctx = await loadContext(trainerId, body.clientId, null);
  const rt = providerRuntime(body.providerId ?? "deepseek", body.model);
  const effort = resolveEffort(rt, body.effort);
  const messages = buildFillMessages({
    ...ctx,
    block,
    programName: program.name,
    plan: program.phasing ?? null,
    lockedWeeks,
    direction: program.direction ?? null,
    trainerInstructions: body.instructions ?? "",
  });

  const [generation] = await db
    .insert(aiGenerations)
    .values({
      trainerId,
      clientId: body.clientId,
      basedOnProgramId: program.id,
      kind: "fill",
      direction: program.direction ?? null,
      instructions: body.instructions ?? null,
      providerId: body.providerId ?? "deepseek",
      model: rt.model,
      effort,
      status: "pending",
      exampleProgramIds: ctx.examples.map((e) => e.programId),
    })
    .returning();
  await recordRegenerated(trainerId, body.clientId, "fill", generation.id);
  const ac = registerGeneration(generation.id);
  try {
    const lifting = lockedWeeks[0].sessions.filter((s) => (s.kind ?? "lifting") === "lifting").length;
    const out = await callLlm({
      purpose: "fill_generate",
      builder: "buildFillMessages",
      links: { trainerId, clientId: body.clientId, generationId: generation.id },
      context: contextSnapshot(ctx, { basedOnProgramId: program.id, basedOnProgramVersion: program.version, block, trainerInstructions: body.instructions ?? "" }),
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
      rt,
      effort,
      signal: ac.signal,
      mode: "json",
      long: true,
      // The weeks after the trainer's, each with their lifting count; letters odd A / even B.
      schema: blockDraftSchema({ plannedWeeks: weeks.length, alternate, lockedWeeks: locked, liftingSessions: isMockRuntime(rt) ? null : lifting }),
      mock: () => JSON.stringify(mockFillDraft(lockedWeeks, { plannedWeeks: weeks.length, alternate, lockedWeeks: locked, phasing: program.phasing })),
    });
    const whole = out.ok ? { ...out, data: completeFill(out.data, program, lockedWeeks) } : out;
    const { code, row } = await settleGeneration(generation.id, whole);
    return { ok: true, code, row };
  } finally {
    deregisterGeneration(generation.id);
  }
}

/** The AI's weeks plus the trainer's (locked), under the program's name and plan. */
export function completeFill(ai: AiProgramDraft, program: Pick<ProgramRow, "name" | "phasing">, locked: AiProgramDraft["weeks"]): AiProgramDraft {
  const merged = withLockedWeeks(ai, locked);
  return { ...merged, name: program.name, ...(program.phasing ? { phasing: program.phasing } : {}) };
}

/** Rebuild a fill revision whole: the trainer's weeks come back from the parent draft. */
export function refillLocked(revised: AiProgramDraft, parent: AiProgramDraft): AiProgramDraft {
  const locked = parent.weeks.filter((w) => w.locked);
  return { ...withLockedWeeks(revised, locked), ...(parent.phasing ? { phasing: parent.phasing } : {}) };
}

export type FillApply =
  | { ok: false; status: 404 | 409 | 422; error: string; refs?: string[] }
  | { ok: true; program: ProgramRow; written: number[]; skipped: number[] };

/**
 * Apply a fill: each AI week replaces its program week (fresh ids, the old
 * week's calendar kept, its A/B letter kept). The trainer's weeks are never
 * written; a week logged since the draft was made is skipped and listed.
 */
export async function applyFill(trainerId: string, gen: AiGenerationRow): Promise<FillApply> {
  if (!gen.basedOnProgramId || !gen.draft) return { ok: false, status: 404, error: "program not found" };
  const [prog] = await db.select().from(programs).where(eq(programs.id, gen.basedOnProgramId));
  if (!prog) return { ok: false, status: 404, error: "program not found" };
  if (prog.status === "archived") return { ok: false, status: 409, error: "program is archived" };

  const logged = new Set(await programLoggedWeeks(prog));
  const [client] = await db.select().from(clients).where(eq(clients.id, gen.clientId));
  const catalog = (await db.select().from(exercises)).filter((e) => e.trainerId === null || e.trainerId === trainerId);
  const types = await ensureSessionTypes(trainerId);
  const labels = await loadRoleLabels(trainerId);
  let weeks: ProgramWeek[] = prog.sessions;
  const created = new Set<string>();
  const unresolvable = new Set<string>();
  const written: number[] = [];
  const skipped: number[] = [];
  for (const w of gen.draft.weeks) {
    if (w.locked || !weeks.some((x) => x.week === w.week)) continue;
    if (logged.has(w.week)) {
      skipped.push(w.week);
      continue;
    }
    const res = replaceWeek(weeks, w.week, { ...gen.draft, weeks: [w] }, catalog, client ?? undefined, types, labels, gen.trainerOrder);
    res.createdNames.forEach((n) => created.add(n));
    res.unresolvable.forEach((r) => unresolvable.add(r));
    weeks = res.weeks;
    written.push(w.week);
  }
  if (unresolvable.size) return { ok: false, status: 422, error: "draft references unresolvable exercises", refs: [...unresolvable] };

  const nameToId = new Map<string, string>();
  for (const name of created) {
    const [row] = await db.insert(exercises).values({ trainerId, name, primaryMuscleGroup: "full_body", equipment: "other" }).returning();
    nameToId.set(name.toLowerCase(), row.id);
  }
  const doc = ProgramWeeksDocument.safeParse(bindPendingExercises(weeks, nameToId));
  if (!doc.success) return { ok: false, status: 422, error: "invalid weeks document" };
  const [updated] = await db.update(programs).set({ sessions: doc.data, version: prog.version + 1 }).where(eq(programs.id, prog.id)).returning();
  await db.update(aiGenerations).set({ status: "approved", approvedProgramId: prog.id }).where(eq(aiGenerations.id, gen.id));
  return { ok: true, program: updated, written, skipped };
}
