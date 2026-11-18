/**
 * Whole-block AI draft evaluation (FB-013) — run by hand against real
 * providers; never in CI. Costs money: every case is one full block call
 * (plus at most one retry).
 *
 * Each case goes through the same code as the routes — startBlock
 * (POST /v1/ai/generate, no targetWeek) or startFill (POST /v1/ai/fill) — so
 * prompts, schema checks, the one retry and the block output ceiling
 * (blockOutputTokens) are the real ones and every attempt lands in llm_calls.
 * Per case it reports the outcome (ok / failure reason), latency, tokens,
 * finish_reason and attempts from llm_calls, then checks the draft: weeks
 * returned vs asked, A/B letters (odd A, even B; none on Same), A and B
 * routines differ, same-letter weeks progress without wild jumps, and on a
 * fill that the trainer's weeks come back unchanged.
 *
 * Matrix per provider: b6-same, b6-ab, b12-ab (blocks on the two clients with
 * the most logged history) and fill-ab (an A/B copy of the second client's
 * active program — W1 A and W2 B written by the "trainer" — so W3+ are
 * filled). The fixture program is created as a draft and deleted afterwards
 * (--keep-fixture keeps it); the trainer's Weeks choice is restored.
 *
 * Usage: bun --env-file=.env.local run eval:block [--provider deepseek]
 *        [--model glm-5.3] [--effort low] [--only deepseek:b6-ab,fill-ab]
 *        [--concurrency 8] [--out /tmp/fb013-eval] [--probe 131072,65536]
 * --probe sends one tiny "long" call per max_tokens value (first provider)
 * and exits — checks a provider accepts a block output ceiling.
 * Refuses to run unless DATABASE_URL points at localhost.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    provider: { type: "string", default: "deepseek" },
    model: { type: "string" },
    effort: { type: "string" },
    only: { type: "string" },
    concurrency: { type: "string", default: "8" },
    out: { type: "string", default: "/tmp/fb013-eval" },
    probe: { type: "string" },
    "keep-fixture": { type: "boolean", default: false },
  },
});

// Local database only — checked before anything connects.
const dbHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1"].includes(dbHost)) {
  console.error("eval:block runs against a local database only (DATABASE_URL host must be localhost or 127.0.0.1)");
  process.exit(1);
}

const { and, asc, desc, eq, inArray, ne, sql } = await import("drizzle-orm");
const { db, aiGenerations, clients, exercises, llmCalls, programs, sessionLogs, trainers } = await import("@pt/db");
const { ProgramWeeksDocument, programWeekToDraftWeek, rotationOfWeek, setAlternating } = await import("@pt/shared");
type AiProgramDraft = import("@pt/shared").AiProgramDraft;
type DraftWeek = AiProgramDraft["weeks"][number];
type ProgramWeek = import("@pt/shared").ProgramWeek;
const { providerRuntime, resolveEffort } = await import("../src/ai/runtime");
const { chatText } = await import("../src/ai/provider");
const { startBlock } = await import("../src/lib/block");
const { startFill } = await import("../src/lib/fill");

const providers = values.provider!.split(",").map((s) => s.trim()).filter(Boolean);

// --- probe mode: is a max_tokens value accepted? ---------------------------
if (values.probe) {
  const base = providerRuntime(providers[0], values.model);
  for (const n of values.probe.split(",").map(Number)) {
    const rt = { ...base, blockOutputTokens: n };
    try {
      const r = await chatText(rt, [{ role: "user", content: "Reply with the single word OK." }], { long: true, effort: resolveEffort(rt, values.effort) ?? rt.defaultEffort });
      console.log(`${rt.providerId} ${rt.model} max_tokens ${n}: accepted · finish ${r.finishReason} · out ${r.usage?.tokensOut} · ${r.latencyMs} ms · "${r.content.trim().slice(0, 40)}"`);
    } catch (err) {
      const e = err as { status?: number; message: string; body?: string };
      console.log(`${rt.providerId} ${rt.model} max_tokens ${n}: REJECTED ${e.status ?? ""} ${e.message} ${e.body ?? ""}`);
    }
  }
  process.exit(0);
}

// --- clients and the fill fixture -----------------------------------------
const FIXTURE_NAME = "[eval] A/B fill fixture";
const richest = await db
  .select({ id: clients.id, name: clients.name, trainerId: clients.trainerId, logs: sql<number>`count(${sessionLogs.id})::int` })
  .from(clients)
  .leftJoin(sessionLogs, eq(sessionLogs.clientId, clients.id))
  .groupBy(clients.id)
  .orderBy(desc(sql`count(${sessionLogs.id})`), desc(sql`length(coalesce(${clients.goals}, '') || coalesce(${clients.limitations}, ''))`))
  .limit(2);
if (richest.length < 2) throw new Error("need two clients in the local database");
const activeProgram = async (clientId: string) =>
  (await db.select().from(programs).where(and(eq(programs.clientId, clientId), eq(programs.status, "active"), ne(programs.name, FIXTURE_NAME))).orderBy(desc(programs.createdAt)))[0];

const lifting = (w: ProgramWeek) => w.sessions.filter((s) => (s.kind ?? "exercises") === "exercises");

/** An A/B copy of `src`: odd weeks A as written, even weeks B with lifting from another program (a different routine). */
async function fillFixture(src: typeof programs.$inferSelect) {
  await db.delete(programs).where(and(eq(programs.clientId, src.clientId!), eq(programs.name, FIXTURE_NAME)));
  const others = await db.select().from(programs).where(and(eq(programs.trainerId, src.trainerId), ne(programs.id, src.id)));
  const need = lifting(src.sessions[0]).length;
  const aNames = new Set(lifting(src.sessions[0]).flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  const donor = others
    .map((p) => p.sessions[0])
    .find((w) => w && lifting(w).length === need && lifting(w).some((s) => s.exercises.some((e) => !aNames.has(e.exerciseId))));
  if (!donor) throw new Error("no program with a different routine to borrow the B week from");
  const weeks = setAlternating(structuredClone(src.sessions), true).map((w) => {
    if (w.rotation !== "B") return w;
    let i = 0;
    return {
      ...w,
      sessions: w.sessions.map((s) => {
        if ((s.kind ?? "exercises") !== "exercises") return s;
        const d = lifting(donor)[i++];
        return { ...s, name: d.name, exercises: structuredClone(d.exercises) };
      }),
    };
  });
  const [row] = await db
    .insert(programs)
    .values({
      trainerId: src.trainerId,
      clientId: src.clientId,
      name: FIXTURE_NAME,
      status: "draft",
      sessions: ProgramWeeksDocument.parse(weeks),
      phasing: src.phasing,
      direction: src.direction,
    })
    .returning();
  return row;
}

// --- cases ------------------------------------------------------------------
interface Case {
  id: string;
  provider: string;
  kind: "block" | "fill";
  client: (typeof richest)[number];
  weeks: number;
  alternate: boolean;
}
const [c1, c2] = richest;
const shapes = [
  { name: "b6-same", kind: "block", client: c1, weeks: 6, alternate: false },
  { name: "b6-ab", kind: "block", client: c2, weeks: 6, alternate: true },
  { name: "b12-ab", kind: "block", client: c1, weeks: 12, alternate: true },
  { name: "fill-ab", kind: "fill", client: c2, weeks: 0, alternate: true },
] as const;
const only = values.only?.split(",").map((s) => s.trim()).filter(Boolean);
const cases: Case[] = providers.flatMap((provider) =>
  shapes
    .map((s) => ({ ...s, id: `${provider}:${s.name}`, provider }))
    .filter((c) => !only || only.includes(c.id) || only.includes(c.id.split(":")[1])),
);

const catalog = new Map((await db.select({ id: exercises.id, name: exercises.name }).from(exercises)).map((e) => [e.id, e.name]));
const exName = (e: { exerciseId?: string | null; exerciseName?: string | null }) =>
  e.exerciseName ?? (e.exerciseId ? catalog.get(e.exerciseId) ?? e.exerciseId : "?");

const trainerIds = [...new Set(cases.map((c) => c.client.trainerId))];
const weeksChoiceBefore = trainerIds.length
  ? await db.select({ id: trainers.id, choice: trainers.lastWeeksChoice }).from(trainers).where(inArray(trainers.id, trainerIds))
  : [];
const fillSrc = cases.some((c) => c.kind === "fill") ? await activeProgram(c2.id) : undefined;
if (cases.some((c) => c.kind === "fill") && !fillSrc) throw new Error(`${c2.name} has no active program to fill`);
const fixture = fillSrc ? await fillFixture(fillSrc) : undefined;

const rt0 = providerRuntime(providers[0], values.model);
console.log(
  `eval:block — ${cases.length} cases · clients ${c1.name} (${c1.logs} logs), ${c2.name} (${c2.logs} logs)` +
    (fixture ? ` · fill fixture from "${fillSrc!.name}"` : "") +
    ` · ${rt0.providerId} ceiling ${rt0.blockOutputTokens}\n`,
);

// --- checks -----------------------------------------------------------------
const topSet = (e: DraftWeek["sessions"][number]["exercises"][number]) => {
  const working = e.prescribedSets.filter((s) => s.type === "working");
  const sets = working.length ? working : e.prescribedSets;
  const max = (k: "targetWeightKg" | "percent1rm" | "targetRpe") => Math.max(0, ...sets.map((s) => s[k] ?? 0));
  return { sets: sets.length, reps: Math.max(...sets.map((s) => s.reps)), kg: max("targetWeightKg"), pct: max("percent1rm"), rpe: max("targetRpe") };
};
const exerciseKeys = (w: DraftWeek) => [...new Set(w.sessions.flatMap((s) => s.exercises.map((e) => exName(e).toLowerCase())))].sort();

/** Same-letter week pairs: what changed, and any wild jump (load > +15 % / +10 kg, RPE > +1.5, sets ±3). */
function progression(weeks: DraftWeek[], alternate: boolean) {
  const jumps: string[] = [];
  let pairs = 0;
  let changed = 0;
  let added = 0;
  for (const w of weeks) {
    const prev = [...weeks].reverse().find((p) => p.week < w.week && (!alternate || p.rotation === w.rotation));
    if (!prev) continue;
    pairs++;
    const before = new Map(prev.sessions.flatMap((s) => s.exercises.map((e) => [exName(e).toLowerCase(), topSet(e)] as const)));
    let differs = false;
    for (const s of w.sessions)
      for (const e of s.exercises) {
        const b = before.get(exName(e).toLowerCase());
        const a = topSet(e);
        if (!b) continue;
        if (JSON.stringify(a) !== JSON.stringify(b)) differs = true;
        // RPE-only → a load is a first load, not a jump
        if (b.kg === 0 && a.kg > 0) added++;
        else if (b.kg > 0 && ((a.kg > b.kg * 1.15 && a.kg - b.kg > 2.5) || a.kg - b.kg > 10)) jumps.push(`W${prev.week}→W${w.week} ${exName(e)} ${b.kg}→${a.kg} kg`);
        if (b.pct > 0 && a.pct - b.pct > 7.5) jumps.push(`W${prev.week}→W${w.week} ${exName(e)} ${b.pct}→${a.pct} %1RM`);
        if (b.rpe > 0 && a.rpe - b.rpe > 1.5) jumps.push(`W${prev.week}→W${w.week} ${exName(e)} RPE ${b.rpe}→${a.rpe}`);
        if (Math.abs(a.sets - b.sets) >= 3) jumps.push(`W${prev.week}→W${w.week} ${exName(e)} ${b.sets}→${a.sets} sets`);
      }
    if (differs) changed++;
  }
  return { pairs, changed, added, jumps };
}

const stable = (w: DraftWeek) => JSON.stringify(w, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));

interface Result {
  case: Case;
  row?: typeof aiGenerations.$inferSelect;
  calls: (typeof llmCalls.$inferSelect)[];
  error?: string;
  ms: number;
}

async function runCase(c: Case): Promise<Result> {
  const started = performance.now();
  const based = c.kind === "fill" ? fixture! : await activeProgram(c.client.id);
  const body = { clientId: c.client.id, providerId: c.provider, model: values.model, effort: values.effort };
  console.log(`▶ ${c.id} (${c.client.name})`);
  try {
    const row =
      c.kind === "fill"
        ? await (async () => {
            const r = await startFill(c.client.trainerId, { ...body, basedOnProgramId: based.id });
            if (!r.ok) throw new Error(`${r.status} ${r.error}`);
            return r.row;
          })()
        : (await startBlock(c.client.trainerId, { ...body, basedOnProgramId: based?.id ?? null, plannedWeeks: c.weeks, alternate: c.alternate })).row;
    const calls = await db.select().from(llmCalls).where(eq(llmCalls.generationId, row.id)).orderBy(asc(llmCalls.attempt));
    const ms = Math.round(performance.now() - started);
    console.log(`■ ${c.id} ${row.status} in ${(ms / 1000).toFixed(0)} s`);
    return { case: c, row, calls, ms };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    console.log(`■ ${c.id} threw: ${(err as Error).message}`);
    return { case: c, calls: [], error: (err as Error).message, ms };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const results = await pool(cases, Math.max(1, Number(values.concurrency)), runCase);

// --- clean up -----------------------------------------------------------------
for (const t of weeksChoiceBefore) await db.update(trainers).set({ lastWeeksChoice: t.choice }).where(eq(trainers.id, t.id));
if (fixture && !values["keep-fixture"]) await db.delete(programs).where(eq(programs.id, fixture.id));

// --- report -------------------------------------------------------------------
const lockedWant = fixture
  ? new Map(
      fixture.sessions
        .filter((w) => w.week <= 2)
        .map((w) => [w.week, stable({ ...programWeekToDraftWeek(w, { locked: true }) })] as const),
    )
  : new Map<number, string>();

const rows: Record<string, string | number>[] = [];
const details: string[] = [];
for (const r of results) {
  const c = r.case;
  const last = r.calls.at(-1);
  const sum = (k: "tokensIn" | "tokensOut" | "tokensReasoning") => r.calls.reduce((n, x) => n + (x[k] ?? 0), 0);
  const draft = r.row?.status === "validated" ? r.row.draft : null;
  const aiWeeks = draft ? draft.weeks.filter((w) => !w.locked) : [];
  const asked = c.kind === "fill" ? fixture!.sessions.length - lockedWant.size : c.weeks;
  const rotationOk = draft ? draft.weeks.every((w) => (c.alternate ? w.rotation === rotationOfWeek(w.week) : w.rotation == null)) : null;
  const a = draft?.weeks.find((w) => w.rotation === "A" && !w.locked) ?? draft?.weeks.find((w) => w.rotation === "A");
  const b = draft?.weeks.find((w) => w.rotation === "B" && !w.locked) ?? draft?.weeks.find((w) => w.rotation === "B");
  const abDiff = a && b ? exerciseKeys(a).filter((x) => !exerciseKeys(b).includes(x)).length : null;
  const prog = draft ? progression(draft.weeks, c.alternate) : null;
  const lockedOk = draft && c.kind === "fill" ? [...lockedWant].every(([wk, want]) => {
    const got = draft.weeks.find((w) => w.week === wk);
    return got?.locked === true && stable(got) === want;
  }) : null;
  const rawLocked = c.kind === "fill" && last?.parsed ? ((last.parsed as AiProgramDraft).weeks ?? []).filter((w) => lockedWant.has(w.week)).length : 0;
  const reason = r.error ?? (r.row?.status === "validated" ? "" : `${r.row?.status}: ${r.row?.error ?? ""}`);
  rows.push({
    case: c.id,
    model: r.row?.model ?? "",
    client: c.client.name,
    ok: draft ? "ok" : "FAIL",
    seconds: Math.round((last?.latencyMs ?? r.ms) / 1000),
    "in/out/reason": `${sum("tokensIn")}/${sum("tokensOut")}/${sum("tokensReasoning")}`,
    finish: r.calls.map((x) => x.finishReason ?? x.httpStatus ?? "—").join(","),
    attempts: r.calls.length,
    weeks: draft ? `${aiWeeks.length}/${asked}` : "—",
    rotation: rotationOk == null ? "—" : rotationOk ? "ok" : "WRONG",
    "A≠B": c.alternate ? (abDiff == null ? "—" : `${abDiff} ex differ`) : "n/a",
    progress: prog ? `${prog.changed}/${prog.pairs} pairs change · ${prog.jumps.length} jumps${prog.added ? ` · ${prog.added} first loads` : ""}` : "—",
    locked: c.kind === "fill" ? (lockedOk == null ? "—" : lockedOk && rawLocked === 0 ? "unchanged" : `CHANGED (raw has ${rawLocked})`) : "n/a",
  });
  details.push(
    [
      `### ${c.id} — ${c.client.name}${r.row ? ` · generation ${r.row.id}` : ""}`,
      reason ? `Failure: ${reason.slice(0, 1500)}` : "",
      ...r.calls.map(
        (x) =>
          `- attempt ${x.attempt}: ${x.status} · max_tokens ${x.maxTokens} · effort ${x.effort ?? "—"} · finish ${x.finishReason ?? "—"} · http ${x.httpStatus ?? "—"} · ${Math.round((x.latencyMs ?? 0) / 1000)} s · in ${x.tokensIn} / out ${x.tokensOut} / reasoning ${x.tokensReasoning}${x.error ? ` · ${x.error.slice(0, 600).replace(/\n/g, " ")}` : ""}`,
      ),
      prog?.jumps.length ? `Jumps: ${prog.jumps.join("; ")}` : "",
      a && b ? `A: ${exerciseKeys(a).join(", ")}\nB: ${exerciseKeys(b).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function renderDraft(d: AiProgramDraft): string {
  const set = (s: AiProgramDraft["weeks"][number]["sessions"][number]["exercises"][number]["prescribedSets"][number]) =>
    [
      s.repsMin != null ? `${s.repsMin}–${s.reps}` : s.durationSeconds ? `${s.durationSeconds}s` : `${s.reps}${s.amrap ? "+" : ""}`,
      s.targetWeightKg != null ? `@${s.targetWeightKg}kg` : "",
      s.percent1rm != null ? `@${s.percent1rm}%` : "",
      s.targetRpe != null ? `RPE ${s.targetRpeMin != null && s.targetRpeMin !== s.targetRpe ? `${s.targetRpeMin}–` : ""}${s.targetRpe}` : "",
      s.targetRir != null ? `RIR ${s.targetRir}` : "",
      s.type !== "working" ? `(${s.type})` : "",
    ]
      .filter(Boolean)
      .join(" ");
  const sets = (list: Parameters<typeof set>[0][]) => {
    const parts: string[] = [];
    for (const s of list) {
      const t = set(s);
      const prev = parts.at(-1)?.match(/^(\d+)× (.*)$/);
      if (prev && prev[2] === t) parts[parts.length - 1] = `${Number(prev[1]) + 1}× ${t}`;
      else parts.push(`1× ${t}`);
    }
    return parts.join(", ");
  };
  const out = [`# ${d.name}`, "", d.rationale, ""];
  if (d.phasing) out.push(`Phasing: ${JSON.stringify(d.phasing.weeks?.map((w) => `W${w.week} ${w.directive ?? ""}`) ?? d.phasing)}`, "");
  for (const w of d.weeks) {
    out.push(`## Week ${w.week}${w.rotation ? ` (${w.rotation})` : ""}${w.locked ? " — trainer's" : ""}`);
    for (const s of w.sessions) {
      out.push(`**${s.name}**${s.weekday ? ` · day ${s.weekday}` : ""}${s.kind === "cardio" ? ` · cardio ${JSON.stringify(s.cardio)}` : ""}`);
      for (const e of s.exercises) out.push(`- ${e.group ? `[${e.group}] ` : ""}${exName(e)}${e.role ? ` (${e.role})` : ""}: ${sets(e.prescribedSets)}${e.notes ? ` — ${e.notes}` : ""}`);
      out.push("");
    }
  }
  return out.join("\n");
}

console.log();
console.table(rows);
const totalCalls = results.reduce((n, r) => n + r.calls.length, 0);
console.log(`provider calls: ${totalCalls}`);

mkdirSync(values.out!, { recursive: true });
const header = Object.keys(rows[0] ?? {});
writeFileSync(
  join(values.out!, "report.md"),
  [
    `# eval:block — ${new Date().toISOString()}`,
    "",
    `Clients: ${c1.name} (${c1.logs} logs), ${c2.name} (${c2.logs} logs). Provider calls: ${totalCalls}.`,
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${header.map((h) => String(r[h]).replace(/\|/g, "\\|")).join(" | ")} |`),
    "",
    ...details.flatMap((d) => [d, ""]),
  ].join("\n"),
);
for (const r of results) {
  if (r.row?.status !== "validated" || !r.row.draft) continue;
  writeFileSync(join(values.out!, `${r.case.id.replace(":", "-")}.md`), renderDraft(r.row.draft));
  writeFileSync(join(values.out!, `${r.case.id.replace(":", "-")}.json`), JSON.stringify(r.row.draft, null, 2));
}
console.log(`report: ${join(values.out!, "report.md")}`);
process.exit(0);
