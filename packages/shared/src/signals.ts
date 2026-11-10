import { estimate1rm, isPainFlag, weekSessions } from "./domain";
import type { CardioTarget } from "./domain";
import { DELOAD_RULES } from "./deload";
import { shortDate } from "./autoreg";
import { cardioDone, cardioUnitLabel, cardioWeekTotals, isoWeekStart, type CardioCountLog } from "./cardio";
import { blockPulse, blockWeekOfDate, daysIntoBlock, localDateOf, mainLiftIds, pulseSummary, timedExerciseIds, weekOf } from "./metrics";
import type { SignalLog, SignalProgram } from "./metrics";

/**
 * Phase-change signals: deterministic rules over (program, logs, now).
 * Computed on read — no background jobs. Trainer decides, system suggests.
 * Ids are deterministic functions of their condition (dedupe + snooze keys).
 */

export type SignalKind =
  | "block-ending"
  | "deload-week"
  | "transition-due"
  | "off-plan"
  | "rpe-creep"
  | "stall"
  | "adherence"
  | "cardio-behind"
  | "week-ending"
  | "pain-flag";

export interface Signal {
  /** Deterministic id, e.g. `block-ending:<programId>` — PK for snooze/outbox. */
  id: string;
  kind: SignalKind;
  severity: "info" | "attention" | "urgent";
  title: string;
  evidence: string;
  /** Owning program/client — lets the API partition a trainer-wide feed.
   *  Null for client-level signals raised without an active program (cardio). */
  programId: string | null;
  clientId: string | null;
  /** Pre-filled note for the generate flow, when the signal warrants a new block. */
  prefillNote?: string;
  /** Template id to auto-toggle on the generate flow. */
  templateHint?: string;
  /** Alternative action when generating isn't the answer. */
  altHref?: string;
  altLabel?: string;
  /** Weekly-cadence target the action opens (week-ending). */
  targetWeek?: number;
}

/** Same work getting harder: avg RPE at identical load AND reps, latest vs
 *  earliest block week. Matching reps keeps double progression (+1 rep at the
 *  same load) from reading as fatigue. */
function rpeCreep(program: SignalProgram, logs: SignalLog[], nameOf: (id: string) => string): Signal | null {
  const byWork = new Map<string, Map<number, { rpeSum: number; n: number }>>();
  for (const log of logs) {
    const week = blockWeekOfDate(program, logs, log.date);
    for (const s of log.sets) {
      if (!s.weightKg || !s.rpe || !s.reps) continue;
      const key = `${s.exerciseId}@${s.weightKg}x${s.reps}`;
      const weeks = byWork.get(key) ?? new Map<number, { rpeSum: number; n: number }>();
      const w = weeks.get(week) ?? { rpeSum: 0, n: 0 };
      w.rpeSum += s.rpe;
      w.n += 1;
      weeks.set(week, w);
      byWork.set(key, weeks);
    }
  }

  let worst: { exId: string; ex: string; weight: number; reps: number; from: number; to: number; delta: number } | null = null;
  for (const [key, weeks] of byWork) {
    const sorted = [...weeks.entries()].sort((a, b) => a[0] - b[0]);
    if (sorted.length < 2) continue;
    const [fromWeek, first] = sorted[0];
    const [toWeek, last] = sorted[sorted.length - 1];
    if (last.n < 2 || first.n < 1) continue;
    const delta = last.rpeSum / last.n - first.rpeSum / first.n;
    if (delta >= 1.5 && (!worst || delta > worst.delta)) {
      const [exId, work] = key.split("@");
      const [weight, reps] = work.split("x").map(Number);
      worst = { exId, ex: nameOf(exId), weight, reps, from: fromWeek, to: toWeek, delta };
    }
  }
  if (!worst) return null;
  const d = worst.delta.toFixed(1);
  return {
    id: `rpe-creep:${program.id}:${worst.exId}`,
    kind: "rpe-creep",
    severity: "attention",
    title: `Fatigue signal — ${worst.ex}`,
    evidence: `${worst.weight} kg × ${worst.reps} rates +${d} RPE in week ${worst.to} vs week ${worst.from} at the same load and reps.`,
    programId: "",
    clientId: null,
    prefillNote: `Fatigue is building: ${worst.ex} at ${worst.weight} kg × ${worst.reps} rates ~+${d} RPE higher in week ${worst.to} than in week ${worst.from}. Consider a deload or a lighter week before progressing.`,
    templateHint: "tpl-block-structure",
  };
}

/** Planned intensity for `exerciseId` in block week `week`, in one unit so weeks compare:
 *  the highest %1RM when every set is prescribed as %1RM, else the heaviest kg.
 *  Null when the week isn't in the doc or a set has no load target. */
function prescribedLoad(program: SignalProgram, exerciseId: string, week: number): { unit: "pct" | "kg"; value: number } | null {
  const sets = weekSessions(program.weeks, week)
    .flatMap((s) => s.exercises ?? [])
    .filter((e) => e.exerciseId === exerciseId)
    .flatMap((e) => e.prescribedSets as { targetWeightKg?: number | null; percent1rm?: number | null }[]);
  if (sets.length === 0) return null;
  if (sets.every((ps) => ps.percent1rm != null)) return { unit: "pct", value: Math.max(...sets.map((ps) => ps.percent1rm!)) };
  if (sets.every((ps) => ps.targetWeightKg != null)) return { unit: "kg", value: Math.max(...sets.map((ps) => ps.targetWeightKg!)) };
  return null;
}

/** e1RM flat across recent block weeks while the peak was earlier in the block.
 *  Planned flat ≠ athlete stall: when the prescription held the load flat (or
 *  lower) from the peak week on, the plateau is the plan and nothing fires. */
function stall(program: SignalProgram, logs: SignalLog[], nameOf: (id: string) => string, timed: Set<string>): Signal | null {
  const weeklyBest = new Map<string, Map<number, number>>();
  for (const log of logs) {
    const week = blockWeekOfDate(program, logs, log.date);
    for (const s of log.sets) {
      if (!s.weightKg || !s.reps || s.reps > 12 || timed.has(s.exerciseId)) continue;
      const e1rm = estimate1rm(s.weightKg, s.reps);
      const per = weeklyBest.get(s.exerciseId) ?? new Map<number, number>();
      per.set(week, Math.max(per.get(week) ?? 0, e1rm));
      weeklyBest.set(s.exerciseId, per);
    }
  }
  for (const [exId, weeks] of weeklyBest) {
    const sorted = [...weeks.entries()].sort((a, b) => a[0] - b[0]);
    if (sorted.length < 4) continue;
    let peakIdx = 0;
    let peak = 0;
    sorted.forEach(([, v], i) => {
      if (v > peak) {
        peak = v;
        peakIdx = i;
      }
    });
    // True stall: peak happened ≥ 3 logged weeks ago and nothing since has beaten it.
    if (peakIdx > sorted.length - 4) continue;
    const last2 = sorted.slice(-2).map(([, v]) => v);
    if (Math.max(...last2) > peak * 1.01) continue;

    const peakWeek = sorted[peakIdx][0];
    const lastWeek = sorted[sorted.length - 1][0];
    const planned: ({ unit: "pct" | "kg"; value: number } | null)[] = [];
    for (let w = peakWeek; w <= lastWeek; w++) planned.push(prescribedLoad(program, exId, w));
    // Mixed units (kg one week, %1RM the next) can't be compared: treat as no target.
    const hasTargets = planned.every((l) => l != null && l.unit === planned[0]!.unit);
    const planProgressed = hasTargets && planned.slice(1).some((l) => l!.value > planned[0]!.value);
    if (hasTargets && !planProgressed) continue;

    const name = nameOf(exId);
    return {
      id: `stall:${program.id}:${exId}`,
      kind: "stall",
      severity: "attention",
      title: `${name} plateaued`,
      evidence: `Best estimated 1RM has not moved in the last 2 weeks (peak ${Math.round(peak)} kg in week ${peakWeek}).`,
      programId: "",
      clientId: null,
      prefillNote: `${name} has stalled — estimated 1RM flat for 2 weeks${planProgressed ? " while the plan asked for heavier loads" : ""}. Change the stimulus in the next block: new rep range, exercise variation, or intensity technique.`,
    };
  }
  return null;
}

export function computeSignals(
  program: SignalProgram | null,
  logs: SignalLog[],
  nameOf: (id: string) => string,
  clientSessionsPerWeek?: number | null,
  now = Date.now(),
  /** The client's deload rule in words (deloadRulesText(effectiveDeload(…))). */
  deloadRules = DELOAD_RULES
): Signal[] {
  if (!program || program.status !== "active") return [];
  const signals: Signal[] = [];
  const week = weekOf(program, logs, now);
  const ph = program.phasing;
  const programLogs = logs.filter((l) => l.programId === program.id);
  const owner = { programId: program.id, clientId: program.clientId };

  if (ph) {
    const scheme = ph.weeks ?? [];
    const hasTransition = scheme.some((w) => w.directive === "transition");
    const directive = scheme.find((w) => w.week === week)?.directive ?? null;
    const pulse = blockPulse(program, programLogs, now);
    const summary = pulseSummary(pulse);
    const isDeloadWeek = directive === "deload";
    if (isDeloadWeek && week <= ph.plannedWeeks) {
      signals.push({
        ...owner,
        id: `deload-week:${program.id}`,
        kind: "deload-week",
        severity: "info",
        title: `Deload week — week ${week} of ${ph.plannedWeeks}`,
        evidence: `Planned light week for “${program.name}”. Deload: ${deloadRules}.`,
        prefillNote: `This week is a planned deload (week ${week}/${ph.plannedWeeks}). Deload the week: ${deloadRules}.`,
        templateHint: "tpl-block-structure",
      });
    } else if (week >= ph.plannedWeeks) {
      signals.push({
        ...owner,
        id: `block-ending:${program.id}`,
        kind: "block-ending",
        severity: "urgent",
        title: `Block complete — plan ${ph.nextPhase ?? "next block"}`,
        evidence: `“${program.name}” (${ph.phase}) ran its ${ph.plannedWeeks} planned weeks.${summary ? ` Block delivered: ${summary}.` : ""}`,
        prefillNote: `The ${ph.phase} block (${ph.plannedWeeks} weeks) is complete. Draft the ${ph.nextPhase ?? "next"} block, progressing loads from the final week's logged numbers.`,
        templateHint: "tpl-block-structure",
      });
    } else if (!hasTransition && week >= ph.plannedWeeks - 1) {
      signals.push({
        ...owner,
        id: `block-ending:${program.id}`,
        kind: "block-ending",
        severity: "attention",
        title: `${ph.phase} block ends after next week`,
        evidence: `Week ${week} of ${ph.plannedWeeks} on “${program.name}”. Next: ${ph.nextPhase ?? "new block"}.${summary ? ` So far: ${summary}.` : ""}`,
        prefillNote: `The ${ph.phase} block reaches its ${ph.plannedWeeks}-week limit after next week. Draft the ${ph.nextPhase ?? "next"} block now, progressing loads from the most recent logged numbers.`,
        templateHint: "tpl-block-structure",
      });
    }

    // Scheme-aware rules: the plan says what each week SHOULD do — compare with reality.
    if (directive === "transition" && week < ph.plannedWeeks) {
      signals.push({
        ...owner,
        id: `transition:${program.id}:w${week}`,
        kind: "transition-due",
        severity: "attention",
        title: `Transition week ${week} — draft the shift`,
        evidence: `Scheme says transition: introduce movement variants, cut volume ~20%.${summary ? ` Block so far: ${summary}.` : ""}`,
        prefillNote: `Transition week (${week}/${ph.plannedWeeks}) of the ${ph.phase} block: shift toward ${ph.nextPhase ?? "the next phase"}. Cut volume ~20%, introduce variant movements, hold loads steady.`,
        templateHint: "tpl-block-structure",
      });
    }

    const daysIn = daysIntoBlock(program, logs, now);
    if (week < ph.plannedWeeks && daysIn % 7 >= 5) {
      const next = scheme.find((w) => w.week === week + 1) ?? null;
      signals.push({
        ...owner,
        id: `week-ending:${program.id}:w${week + 1}`,
        kind: "week-ending",
        severity: "info",
        title: `Week ${week} of ${ph.plannedWeeks} ends soon — draft week ${week + 1}`,
        evidence:
          `“${program.name}” rolls into week ${week + 1}` +
          (next ? ` — directive ${next.directive}` +
            (next.target
              ? ` (target ${next.target.deltaPercent >= 0 ? "+" : ""}${next.target.deltaPercent}% ${next.target.metric.replace("_", " ")})`
              : "")
            : " — no directive set for that week") +
          `. Re-draft it from this week's logs.`,
        prefillNote: `Re-draft week ${week + 1} of the ${ph.phase} block from this week's logged numbers.`,
        targetWeek: week + 1,
      });
    }

    const cur = pulse.find((w) => w.week === week);
    const prev = pulse.find((w) => w.week === week - 1);
    if (cur && prev && !cur.plannedOnly && !prev.plannedOnly) {
      const t = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`);
      if (directive === "+volume" && prev.overallVolume > 0 && cur.overallVolume <= prev.overallVolume * 1.03) {
        signals.push({
          ...owner,
          id: `offplan-vol:${program.id}:w${week}`,
          kind: "off-plan",
          severity: "attention",
          title: `Planned +volume — overall volume came in flat`,
          evidence: `Week ${week} directive is +volume, but logged overall volume is ${t(cur.overallVolume)} vs ${t(prev.overallVolume)} last week. Add a set, or check what got skipped.`,
          prefillNote: `Week ${week} should add volume but last week came in flat — draft this week's sessions with one extra working set on the main lifts.`,
        });
      }
      // Main lifts (role power/primary, else every loaded non-timed lift) logged in
      // both weeks; the rule fires only when none of them moved more than 1 %.
      const main = mainLiftIds(program);
      const compared = Object.keys(cur.e1rmByExercise)
        .filter((id) => (main ? main.has(id) : true) && (prev.e1rmByExercise[id] ?? 0) > 0)
        .map((id) => ({ id, now: cur.e1rmByExercise[id], before: prev.e1rmByExercise[id] }))
        .sort((x, y) => y.now - x.now);
      if (directive === "+intensity" && compared.length > 0 && compared.every((c) => c.now <= c.before * 1.01)) {
        const lifts = compared.map((c) => `${nameOf(c.id)} ${Math.round(c.before)} → ${Math.round(c.now)}`).join(", ");
        signals.push({
          ...owner,
          id: `offplan-int:${program.id}:w${week}`,
          kind: "off-plan",
          severity: "attention",
          title: `Planned +intensity — main lifts' e1RM didn't move`,
          evidence: `Week ${week} directive is +intensity, but no main lift's e1RM rose more than 1 % on last week (${lifts} kg). Repeat the loads, or consider the early transition.`,
          prefillNote: `Week ${week} should push intensity but loads stalled — draft sessions that repeat last week's loads with a rep target bump instead.`,
        });
      }
      if (directive === "+volume" && cur.avgRpe != null && cur.avgRpe >= 8.5 && (prev.avgRpe ?? 0) < cur.avgRpe) {
        signals.push({
          ...owner,
          id: `fatigue:${program.id}:w${week}`,
          kind: "off-plan",
          severity: "info",
          title: `+volume planned, but RPE is at the ceiling`,
          evidence: `Avg RPE this week: ${cur.avgRpe} (last week ${prev.avgRpe ?? "—"}). Body may not absorb more volume — consider holding instead.`,
          prefillNote: `Planned +volume but avg RPE is ${cur.avgRpe} — hold volume at last week's level this week instead of adding.`,
        });
      }
    }
  }

  // Adherence: lifting sessions logged vs sessions DUE SO FAR. Logs count lifting only
  // (cardio never inflates), so the weekly rate is the program week's LIFTING session
  // count, falling back to the client's sessionsPerWeek when the week has no lifting doc.
  // Due = rate × elapsed days ÷ 7 from the block anchor — nothing is due before it,
  // and the rule waits a full week before judging.
  // Suppressed near block end — the block-ending review already brings the trainer in.
  const phaseSignalExists = signals.some((s) => s.kind === "block-ending" || s.kind === "deload-week");
  const elapsedDays = daysIntoBlock(program, programLogs, now);
  const plannedLifting = weekSessions(program.weeks, week).filter((s) => s.kind !== "cardio").length;
  const perWeek = plannedLifting > 0 ? plannedLifting : (clientSessionsPerWeek ?? 0);
  const expected = (perWeek * elapsedDays) / 7;
  const logged = programLogs.filter((l) => l.kind !== "cardio").length;
  if (!phaseSignalExists && elapsedDays >= 7 && expected > 0 && logged / expected < 0.6) {
    signals.push({
      ...owner,
      id: `adherence:${program.id}`,
      kind: "adherence",
      severity: "attention",
      title: "Low adherence — check in",
      evidence: `${logged} of ~${Math.round(expected)} lifting sessions due so far (${perWeek}/week over ${elapsedDays} days since the block started).`,
      altHref: `/clients/${program.clientId}`,
      altLabel: "Review client",
    });
  }

  const creep = rpeCreep(program, programLogs, nameOf);
  if (creep) signals.push({ ...creep, ...owner });
  const stalled = stall(program, programLogs, nameOf, timedExerciseIds(program));
  if (stalled) signals.push({ ...stalled, ...owner });

  return signals;
}

/** Cardio pace check, merged by each signal caller next to computeSignals.
 *  The target is a weekly client attribute, so it runs with or without an
 *  active program (`owner.programId` null). Pace is pro-rated from the later of
 *  the ISO week's Monday and the client's creation day (today counts), and the
 *  rule fires when done < 0.6 × target × elapsed/7 — no rounding — on Thursday
 *  or later. Nothing is due on the day the client was created. */
export function cardioBehindSignal(
  owner: { programId: string | null; clientId: string | null },
  target: CardioTarget,
  logs: CardioCountLog[],
  now: number = Date.now(),
  clientCreatedAt?: string | null
): Signal | null {
  const isoWeekday = (new Date(now).getDay() + 6) % 7 + 1; // 1=Mon … 7=Sun
  if (isoWeekday < 4) return null; // only Thu–Sun
  const today = localDateOf(now);
  const weekStart = isoWeekStart(new Date(now));
  const created = clientCreatedAt ? localDateOf(Date.parse(clientCreatedAt)) : null;
  if (created === today) return null;
  const start = created && created > weekStart ? created : weekStart;
  const elapsedDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  const label = cardioUnitLabel(target.unit);
  const done = cardioDone(target, cardioWeekTotals(logs, weekStart));
  const expected = 0.6 * target.value * (elapsedDays / 7);
  if (done >= expected) return null;
  const dayName = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][isoWeekday - 1];
  return {
    id: `cardio-behind:${owner.clientId}`,
    kind: "cardio-behind",
    severity: "attention",
    title: "Cardio behind weekly target",
    evidence: `${done} of ${target.value} ${label} logged this week — pace expects ≥ ${Math.ceil(expected)} by ${dayName}.`,
    programId: owner.programId,
    clientId: owner.clientId,
    altHref: `/clients/${owner.clientId}`,
    altLabel: "Review client",
  };
}

/** How far back a pain flag still raises a signal. */
export const PAIN_FLAG_DAYS = 14;

/** Pain check, merged by each signal caller next to computeSignals: one signal
 *  per client + exercise with a pain flag (or a skip for pain) in the last
 *  14 days, citing each date and note. The id carries the newest flag's date,
 *  so a fresh flag after a snooze shows again. */
export function painFlagSignals(
  owner: { programId: string | null; clientId: string | null },
  logs: Pick<SignalLog, "date" | "flags">[],
  nameOf: (id: string) => string,
  now: number = Date.now()
): Signal[] {
  const today = localDateOf(now);
  const since = localDateOf(Date.parse(`${today}T12:00:00Z`) - PAIN_FLAG_DAYS * 86_400_000);
  const byExercise = new Map<string, { date: string; note?: string; skipped: boolean }[]>();
  for (const log of logs) {
    const date = log.date.slice(0, 10);
    if (date <= since || date > today) continue;
    for (const f of log.flags ?? []) {
      if (!isPainFlag(f)) continue;
      const list = byExercise.get(f.exerciseId) ?? [];
      list.push({ date, note: f.note?.trim() || undefined, skipped: f.kind === "skipped" });
      byExercise.set(f.exerciseId, list);
    }
  }
  const signals: Signal[] = [];
  for (const [exId, hits] of byExercise) {
    hits.sort((a, b) => b.date.localeCompare(a.date));
    const name = nameOf(exId);
    const cites = hits
      .map((h) => `${shortDate(h.date)}${h.skipped ? " (skipped)" : ""}${h.note ? ` “${h.note}”` : ""}`)
      .join("; ");
    signals.push({
      id: `pain-flag:${owner.clientId}:${exId}:${hits[0].date}`,
      kind: "pain-flag",
      severity: "attention",
      title: `Pain flagged — ${name}${hits.length > 1 ? ` ×${hits.length}` : ""}`,
      evidence: `${name}: pain in the last ${PAIN_FLAG_DAYS} days — ${cites}. Check in before loading it again.`,
      programId: owner.programId,
      clientId: owner.clientId,
      altHref: `/clients/${owner.clientId}`,
      altLabel: "Review client",
    });
  }
  return signals;
}
