import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  aiGenerations,
  clients,
  exercises,
  llmBlobs,
  llmCalls,
  llmExamples,
  llmFeedback,
  llmPairs,
  programs,
  type LlmCallRow,
} from "@pt/db";
import { anchorText, type LlmLabel, type LlmPurpose, type NoteAnchor } from "@pt/shared";

/**
 * Reusable datasets over the LLM log (docs/llm-logging-plan.md §7): SFT and
 * DPO JSONL for tuning, eval cases for replay, compact few-shot records for
 * prompts. Everything leaving the database is pseudonymized: client names →
 * `Client-<hash6>`, emails → `[email]`.
 */

export type ExportFormat = "sft" | "dpo" | "eval" | "fewshot";

export interface ExportFilter {
  purposes?: LlmPurpose[];
  since?: Date;
  /** sft/fewshot: lowest label kept. gold = gold only; silver = gold + silver. */
  minLabel?: "gold" | "silver";
  includeMock?: boolean;
  trainerId?: string;
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

// ---------------------------------------------------------------------------
// Pseudonymizer
// ---------------------------------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface Pseudonymizer {
  text(s: string): string;
  deep<T>(v: T): T;
}

/** Replace every known client name (full, then first name on word boundaries) and every email. */
export function makePseudonymizer(people: { id: string; name: string }[]): Pseudonymizer {
  const rules: [RegExp, string][] = [];
  const firsts: [RegExp, string][] = [];
  for (const p of people) {
    const name = p.name.trim();
    if (!name) continue;
    const alias = `Client-${createHash("sha256").update(p.id).digest("hex").slice(0, 6)}`;
    rules.push([new RegExp(escape(name), "gi"), alias]);
    const first = name.split(/\s+/)[0];
    if (first.length >= 3 && first !== name) firsts.push([new RegExp(`\\b${escape(first)}\\b`, "g"), alias]);
  }
  // longest names first so "Maya Chen" wins over "Maya"
  rules.sort((a, b) => b[0].source.length - a[0].source.length);
  const text = (s: string) => {
    let out = s.replace(EMAIL, "[email]");
    for (const [re, alias] of rules) out = out.replace(re, alias);
    for (const [re, alias] of firsts) out = out.replace(re, alias);
    return out;
  };
  const deep = <T>(v: T): T => {
    if (typeof v === "string") return text(v) as T;
    if (Array.isArray(v)) return v.map(deep) as T;
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => k !== "email")
          .map(([k, val]) => [k, deep(val)])
      ) as T;
    }
    return v;
  };
  return { text, deep };
}

async function pseudonymizerFor(trainerId?: string): Promise<Pseudonymizer> {
  const rows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(trainerId ? eq(clients.trainerId, trainerId) : undefined);
  return makePseudonymizer(rows);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function callsById(ids: string[]): Promise<Map<string, LlmCallRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(llmCalls).where(inArray(llmCalls.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

async function blobsFor(calls: LlmCallRow[]): Promise<Map<string, string>> {
  const shas = [...new Set(calls.flatMap((c) => c.requestBlobIds.map((r) => r.sha)))];
  if (shas.length === 0) return new Map();
  const rows = await db.select().from(llmBlobs).where(inArray(llmBlobs.sha256, shas));
  return new Map(rows.map((r) => [r.sha256, r.content]));
}

const requestMessages = (call: LlmCallRow, blobs: Map<string, string>): Msg[] =>
  call.requestBlobIds.map((r) => ({ role: r.role, content: blobs.get(r.sha) ?? "" }));

function exampleWhere(f: ExportFilter, labels?: LlmLabel[]): SQL | undefined {
  return and(
    f.includeMock ? undefined : eq(llmExamples.isMock, false),
    f.purposes?.length ? inArray(llmExamples.purpose, f.purposes) : undefined,
    f.since ? gte(llmExamples.createdAt, f.since) : undefined,
    f.trainerId ? eq(llmExamples.trainerId, f.trainerId) : undefined,
    labels ? inArray(llmExamples.label, labels) : undefined
  );
}

/**
 * The output the trainer stands behind. Gold: the raw response. Silver: the
 * trainer's version — the edited client message, or the approved program week
 * written back into the draft shape. Null when the target can't be rebuilt.
 */
async function targetFor(
  ex: typeof llmExamples.$inferSelect,
  call: LlmCallRow
): Promise<string | null> {
  if (ex.label !== "silver") return call.responseRaw;
  const edit = ex.editPayload ?? {};
  if (ex.purpose === "client_message" && typeof edit.final === "string") {
    return JSON.stringify({ message: edit.final });
  }
  const programId = typeof edit.programId === "string" ? edit.programId : null;
  if (!programId || !ex.generationId || !call.parsed) return null;
  const [gen] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, ex.generationId));
  const [prog] = await db.select().from(programs).where(eq(programs.id, programId));
  if (!gen || !prog) return null;
  const weekNo = gen.kind === "week" ? gen.targetWeek : prog.sessions[0]?.week;
  const week = prog.sessions.find((w) => w.week === weekNo);
  if (!week) return null;
  const ids = [...new Set(week.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  const names = new Map(
    ids.length
      ? (await db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(inArray(exercises.id, ids))).map(
          (r) => [r.id, r.name]
        )
      : []
  );
  const draft = call.parsed as Record<string, unknown>;
  return JSON.stringify({
    ...draft,
    sessions: week.sessions.map((s) => ({
      name: s.name,
      kind: s.kind,
      ...(s.typeName ? { type: s.typeName } : {}),
      ...(s.cardio ? { cardio: s.cardio } : {}),
      exercises: s.exercises.map((e) => ({
        exerciseName: names.get(e.exerciseId) ?? e.exerciseName ?? e.exerciseId,
        ...(e.role ? { role: e.role } : {}),
        prescribedSets: e.prescribedSets,
      })),
    })),
  });
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

export async function exportRecords(format: ExportFormat, f: ExportFilter = {}): Promise<unknown[]> {
  const anon = await pseudonymizerFor(f.trainerId);
  if (format === "dpo") return exportDpo(f, anon);

  const labels: LlmLabel[] | undefined =
    format === "eval" ? undefined : f.minLabel === "gold" ? ["gold"] : ["gold", "silver"];
  const examples = await db.select().from(llmExamples).where(exampleWhere(f, labels)).orderBy(llmExamples.createdAt);
  const calls = await callsById(examples.map((e) => e.callId));
  const blobs = format === "sft" ? await blobsFor([...calls.values()]) : new Map<string, string>();

  const notes = format === "sft" ? new Map<string, ExportNote[]>() : await notesByCall(examples.map((e) => e.callId));

  const out: unknown[] = [];
  for (const ex of examples) {
    const call = calls.get(ex.callId);
    if (!call) continue;
    if (format === "eval") {
      out.push(
        anon.deep({
          call_id: ex.callId,
          purpose: ex.purpose,
          prompt_version: ex.promptVersion,
          model: ex.model,
          context: call.context,
          expected: ex.label === "negative" ? null : await targetFor(ex, call),
          rejected: ex.label === "negative" ? call.responseRaw : null,
          label: ex.label,
          reason_tags: ex.reasonTags,
          comments: ex.comments,
          notes: notes.get(ex.callId) ?? [],
        })
      );
      continue;
    }
    const target = await targetFor(ex, call);
    if (target == null) continue;
    if (format === "sft") {
      const messages = requestMessages(call, blobs);
      if (messages.length === 0) continue; // mock turns without a rendered prompt
      out.push(anon.deep({ messages: [...messages, { role: "assistant", content: target }] }));
    } else {
      out.push(anon.deep(fewshotRecord(ex, call, target, notes.get(ex.callId) ?? [])));
    }
  }
  return out;
}

interface ExportNote {
  anchor: NoteAnchor | null;
  anchor_text: string;
  comment: string | null;
  correction: string | null;
  scope: string | null;
}

/** Detailed feedback (anchor + correction) per call, oldest first. */
async function notesByCall(callIds: string[]): Promise<Map<string, ExportNote[]>> {
  const out = new Map<string, ExportNote[]>();
  if (callIds.length === 0) return out;
  const rows = await db
    .select()
    .from(llmFeedback)
    .where(
      and(
        inArray(llmFeedback.callId, callIds),
        or(isNotNull(llmFeedback.anchor), isNotNull(llmFeedback.correction))
      )
    )
    .orderBy(llmFeedback.createdAt);
  for (const r of rows) {
    if (!r.callId) continue;
    const list = out.get(r.callId) ?? [];
    list.push({ anchor: r.anchor ?? null, anchor_text: anchorText(r.anchor), comment: r.comment, correction: r.correction, scope: r.scope });
    out.set(r.callId, list);
  }
  return out;
}

function fewshotRecord(ex: typeof llmExamples.$inferSelect, call: LlmCallRow, target: string, notes: ExportNote[] = []) {
  const ctx = call.context as Record<string, any>;
  const client = ctx.client ?? {};
  const situation = [
    client.goals && `Goals: ${client.goals}`,
    client.limitations && `Limitations: ${client.limitations}`,
    client.sessionsPerWeek && `${client.sessionsPerWeek} sessions/week`,
    ctx.direction && `Direction: ${ctx.direction}`,
    ctx.trainerInstructions && `Trainer instructions: ${ctx.trainerInstructions}`,
    ctx.feedback && `Trainer asked: ${ctx.feedback}`,
    ctx.message && `Trainer asked: ${ctx.message}`,
    ctx.week && `Week ${ctx.week}`,
  ]
    .filter(Boolean)
    .join("\n");
  const why = [
    ex.label === "silver" ? "Trainer's corrected version." : "Accepted as written.",
    ex.reasonTags.length ? `Tags: ${ex.reasonTags.join(", ")}` : null,
    ...ex.comments,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    purpose: ex.purpose,
    label: ex.label,
    situation,
    accepted_output: target,
    why,
    ...(notes.length ? { notes: notes.map((n) => ({ on: n.anchor_text, anchor: n.anchor, comment: n.comment, correction: n.correction })) } : {}),
  };
}

async function exportDpo(f: ExportFilter, anon: Pseudonymizer): Promise<unknown[]> {
  const pairs = await db
    .select()
    .from(llmPairs)
    .where(
      and(
        f.includeMock ? undefined : eq(llmPairs.isMock, false),
        f.since ? gte(llmPairs.createdAt, f.since) : undefined,
        f.trainerId ? eq(llmPairs.trainerId, f.trainerId) : undefined
      )
    )
    .orderBy(llmPairs.createdAt);
  const calls = await callsById(pairs.flatMap((p) => [p.preferredCallId, p.nonPreferredCallId]));
  const blobs = await blobsFor([...calls.values()]);
  const out: unknown[] = [];
  for (const p of pairs) {
    const good = calls.get(p.preferredCallId);
    const bad = calls.get(p.nonPreferredCallId);
    if (!good?.responseRaw || !bad?.responseRaw) continue;
    if (f.purposes?.length && !f.purposes.includes(good.purpose)) continue;
    const messages = requestMessages(good, blobs);
    if (messages.length === 0) continue;
    out.push(
      anon.deep({
        input: { messages },
        preferred_output: [{ role: "assistant", content: good.responseRaw }],
        non_preferred_output: [{ role: "assistant", content: bad.responseRaw }],
        metadata: { kind: p.kind, critique: p.critique, purpose: good.purpose },
      })
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stats + retention
// ---------------------------------------------------------------------------

export interface DatasetStats {
  /** Final calls per purpose × label (real calls only). */
  byPurpose: { purpose: LlmPurpose; gold: number; silver: number; negative: number; unlabeled: number }[];
  /** Every attempt (real calls only) by status. */
  attempts: { status: string; n: number }[];
  mockCalls: number;
  feedback: { explicit: number; implicit: number };
  pairs: number;
  tokens: { in: number; out: number };
}

export async function datasetStats(): Promise<DatasetStats> {
  const labelRows = await db
    .select({ purpose: llmExamples.purpose, label: llmExamples.label, n: sql<number>`count(*)::int` })
    .from(llmExamples)
    .where(eq(llmExamples.isMock, false))
    .groupBy(llmExamples.purpose, llmExamples.label);
  const byPurposeMap = new Map<LlmPurpose, DatasetStats["byPurpose"][number]>();
  for (const r of labelRows) {
    const row = byPurposeMap.get(r.purpose) ?? { purpose: r.purpose, gold: 0, silver: 0, negative: 0, unlabeled: 0 };
    row[r.label] = r.n;
    byPurposeMap.set(r.purpose, row);
  }
  const attempts = await db
    .select({ status: llmCalls.status, n: sql<number>`count(*)::int` })
    .from(llmCalls)
    .where(eq(llmCalls.isMock, false))
    .groupBy(llmCalls.status);
  const [mock] = await db.select({ n: sql<number>`count(*)::int` }).from(llmCalls).where(eq(llmCalls.isMock, true));
  const [fb] = await db
    .select({
      explicit: sql<number>`count(*) filter (where ${llmFeedback.signal} in ('thumbs_up','thumbs_down'))::int`,
      implicit: sql<number>`count(*) filter (where ${llmFeedback.signal} not in ('thumbs_up','thumbs_down'))::int`,
    })
    .from(llmFeedback);
  const [pairs] = await db.select({ n: sql<number>`count(*)::int` }).from(llmPairs).where(eq(llmPairs.isMock, false));
  const [tokens] = await db
    .select({
      in: sql<number>`coalesce(sum(${llmCalls.tokensIn}), 0)::int`,
      out: sql<number>`coalesce(sum(${llmCalls.tokensOut}), 0)::int`,
    })
    .from(llmCalls)
    .where(eq(llmCalls.isMock, false));
  return {
    byPurpose: [...byPurposeMap.values()].sort((a, b) => a.purpose.localeCompare(b.purpose)),
    attempts: attempts.sort((a, b) => b.n - a.n),
    mockCalls: mock.n,
    feedback: fb,
    pairs: pairs.n,
    tokens,
  };
}

export const RETENTION_DAYS = 180;

/**
 * Retention: unlabeled successful calls older than `days` lose their
 * response_raw and reasoning (the big columns). Labeled calls — any feedback
 * with a score — are kept whole. The only update besides linkTurn.
 */
export async function pruneUnlabeled(opts: { days?: number; dryRun?: boolean; now?: Date } = {}): Promise<number> {
  const cutoff = new Date((opts.now ?? new Date()).getTime() - (opts.days ?? RETENTION_DAYS) * 86400_000);
  const where = and(
    eq(llmCalls.status, "ok"),
    lt(llmCalls.createdAt, cutoff),
    isNull(llmCalls.prunedAt),
    sql`not exists (select 1 from ${llmFeedback} where ${llmFeedback.callId} = ${llmCalls.id} and ${llmFeedback.score} is not null)`,
    sql`(${llmCalls.responseRaw} is not null or ${llmCalls.reasoning} is not null)`
  );
  if (opts.dryRun) {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(llmCalls).where(where);
    return row.n;
  }
  const rows = await db
    .update(llmCalls)
    .set({ responseRaw: null, reasoning: null, prunedAt: new Date() })
    .where(where)
    .returning({ id: llmCalls.id });
  return rows.length;
}
