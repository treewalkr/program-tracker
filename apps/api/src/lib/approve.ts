import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, aiGenerations, clients, exercises, programs, type AiGenerationRow, type ProgramRow } from "@pt/db";
import { ProgramWeeksDocument, type ProgramWeek } from "@pt/shared";
import { applyFill } from "./fill";
import { bindPendingExercises, draftToWeeks, replaceWeek } from "./draftToProgram";
import { ensureSessionTypes } from "./session-types";
import { loadRoleLabels } from "./role-labels";
import { currentBlockWeek } from "./signals-service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const ALREADY_APPROVED = "This draft was already approved.";

export type ApproveResult =
  | { ok: false; status: 404 | 409 | 422; error: string; refs?: string[] }
  /** `gen` is the row as claimed; `week` is the week the approval feedback diffs against. */
  | { ok: true; gen: AiGenerationRow; program: ProgramRow; week: ProgramWeek | undefined };

/** A refusal that rolls the transaction back (the claim included). */
class Refused {
  constructor(readonly res: Extract<ApproveResult, { ok: false }>) {}
}

/**
 * Approve a validated draft at most once. The generation row is locked first
 * (`FOR UPDATE`), so a second approve — a double click, another tab, a retried
 * request — waits, then sees `approved` and gets a 409. Every write (custom
 * exercises, the program or its week(s), the generation's status) runs in the
 * same transaction: a refusal or error rolls the claim back and the draft stays
 * `validated`. Side effects (feedback rows) are the caller's, after commit.
 *
 * One refusal commits instead: a new-program draft whose weeks fail the
 * document schema is marked `failed_validation` (nothing else is written).
 */
export async function approveGeneration(trainerId: string, id: string): Promise<ApproveResult> {
  try {
    return await db.transaction((tx) => approveIn(tx, trainerId, id));
  } catch (err) {
    if (err instanceof Refused) return err.res;
    throw err;
  }
}

async function approveIn(tx: Tx, trainerId: string, id: string): Promise<ApproveResult> {
  const [gen] = await tx.select().from(aiGenerations).where(eq(aiGenerations.id, id)).for("update");
  if (!gen) throw new Refused({ ok: false, status: 404, error: "generation not found" });
  if (gen.status === "approved") throw new Refused({ ok: false, status: 409, error: ALREADY_APPROVED });
  if (gen.status !== "validated") throw new Refused({ ok: false, status: 409, error: `generation is ${gen.status}, not validated` });
  const draft = gen.draft;
  if (!draft) throw new Refused({ ok: false, status: 409, error: "generation has no draft" });

  if (gen.kind === "fill") {
    const res = await applyFill(tx, trainerId, gen);
    if (!res.ok) throw new Refused(res);
    return { ok: true, gen, program: res.program, week: res.program.sessions.find((w) => w.week === res.written[0]) };
  }

  const [client] = gen.clientId ? await tx.select().from(clients).where(eq(clients.id, gen.clientId)) : [null];
  const catalog = (await tx.select().from(exercises)).filter((e) => e.trainerId === null || e.trainerId === trainerId);
  const types = await ensureSessionTypes(trainerId, { q: tx });
  const labels = await loadRoleLabels(trainerId, tx);

  if (gen.kind === "week") {
    if (!gen.basedOnProgramId) throw new Refused({ ok: false, status: 404, error: "program not found" });
    const [prog] = await tx.select().from(programs).where(eq(programs.id, gen.basedOnProgramId)).for("update");
    if (!prog) throw new Refused({ ok: false, status: 404, error: "program not found" });
    if (prog.status !== "active") throw new Refused({ ok: false, status: 409, error: "program is not active" });

    const weekNow = await currentBlockWeek(prog, Date.now(), tx);
    if (!gen.targetWeek || gen.targetWeek > prog.sessions.length || !(gen.targetWeek === weekNow || gen.targetWeek === weekNow + 1)) {
      throw new Refused({ ok: false, status: 409, error: "generation targets a week that is no longer current" });
    }

    const { weeks, createdNames, unresolvable } = replaceWeek(prog.sessions, gen.targetWeek, draft, catalog, client, types, labels, gen.trainerOrder);
    if (unresolvable.length > 0) {
      throw new Refused({ ok: false, status: 422, error: "draft references unresolvable exercises", refs: unresolvable });
    }
    const nameToId = await createExercises(tx, trainerId, createdNames);
    const parsedDoc = ProgramWeeksDocument.safeParse(bindPendingExercises(weeks, nameToId));
    if (!parsedDoc.success) throw new Refused({ ok: false, status: 422, error: "invalid weeks document" });

    const [program] = await tx
      .update(programs)
      .set({ sessions: parsedDoc.data, version: prog.version + 1 })
      .where(eq(programs.id, prog.id))
      .returning();
    await tx.update(aiGenerations).set({ status: "approved", approvedProgramId: prog.id }).where(eq(aiGenerations.id, gen.id));
    return { ok: true, gen, program, week: parsedDoc.data.find((w) => w.week === gen.targetWeek) };
  }

  const { weeks, createdNames, unresolvable } = draftToWeeks(draft, catalog, client, types, labels, gen.trainerOrder);
  if (unresolvable.length > 0) {
    throw new Refused({ ok: false, status: 422, error: "draft references unresolvable exercises", refs: unresolvable });
  }
  const parsedDoc = ProgramWeeksDocument.safeParse(weeks);
  if (!parsedDoc.success) {
    // Committed on purpose: the draft can never be approved.
    await tx
      .update(aiGenerations)
      .set({ status: "failed_validation", error: z.prettifyError(parsedDoc.error) })
      .where(eq(aiGenerations.id, gen.id));
    return { ok: false, status: 422, error: "invalid weeks document" };
  }

  const nameToId = await createExercises(tx, trainerId, createdNames);
  const finalWeeks = bindPendingExercises(parsedDoc.data, nameToId);
  const [program] = await tx
    .insert(programs)
    .values({
      trainerId,
      clientId: gen.clientId,
      name: draft.name,
      description: draft.clientSummary,
      sessions: finalWeeks,
      phasing: draft.phasing ?? null,
      direction: gen.direction ?? null,
      aiAssisted: true,
      createdFromProgramId: gen.basedOnProgramId,
      status: "draft",
    })
    .returning();
  await tx.update(aiGenerations).set({ status: "approved", approvedProgramId: program.id }).where(eq(aiGenerations.id, gen.id));
  return { ok: true, gen, program, week: finalWeeks[0] };
}

/** Custom exercise rows for genuinely new movements; the trainer renames/recategorizes later. */
async function createExercises(tx: Tx, trainerId: string, names: Iterable<string>): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();
  for (const name of names) {
    const [row] = await tx.insert(exercises).values({ trainerId, name, primaryMuscleGroup: "full_body", equipment: "other" }).returning();
    nameToId.set(name.toLowerCase(), row.id);
  }
  return nameToId;
}
