import { estimate1rm, weekSessions } from "./domain";
import type { CardioTarget } from "./domain";
import { cardioDone, cardioUnitLabel, cardioWeekTotals, isoWeekStart, type CardioCountLog } from "./cardio";
import { blockPulse, blockWeekOfDate, daysIntoBlock, mainLiftIds, pulseSummary, timedExerciseIds, weekOf } from "./metrics";
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
  | "week-ending";

export interface Signal {
  /** Deterministic id, e.g. `block-ending:<programId>` — PK for snooze/outbox. */
  id: string;
  kind: SignalKind;
  severity: "info" | "attention" | "urgent";
  title: string;
  evidence: string;
  /** Owning program/client — lets the API partition a trainer-wide feed. */
  programId: string;
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

/** e1RM flat across recent weeks while peak was earlier in the block. */
function stall(programId: string, logs: SignalLog[], nameOf: (id: string) => string, timed: Set<string>): Signal | null {
  const weeklyBest = new Map<string, Map<string, number>>();
  for (const log of logs) {
    const week = log.date.slice(0, 10);
    for (const s of log.sets) {
      if (!s.weightKg || s.reps > 12 || timed.has(s.exerciseId)) continue;
      const e1rm = estimate1rm(s.weightKg, s.reps);
      const per = weeklyBest.get(s.exerciseId) ?? new Map<string, number>();
      per.set(week, Math.max(per.get(week) ?? 0, e1rm));
      weeklyBest.set(s.exerciseId, per);
    }
  }
  for (const [exId, weeks] of weeklyBest) {
    const sorted = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (sorted.length < 4) continue;
    let peakIdx = 0;
    let peak = 0;
    sorted.forEach(([week, v], i) => {
      if (v > peak) {
        peak = v;
        peakIdx = i;
      }
    });
    // True stall: peak happened ≥ 3 weeks ago and nothing since has beaten it.
    if (peakIdx > sorted.length - 4) continue;
    const last2 = sorted.slice(-2).map(([, v]) => v);
    if (Math.max(...last2) > peak * 1.01) continue;
    const name = nameOf(exId);
    return {
      id: `stall:${programId}:${exId}`,
      kind: "stall",
      severity: "attention",
      title: `${name} plateaued`,
      evidence: `Best estimated 1RM has not moved in the last 2 weeks (peak ${Math.round(peak)} kg).`,
      programId: "",
      clientId: null,
      prefillNote: `${name} has stalled — estimated 1RM flat for 2 weeks. Change the stimulus in the next block: new rep range, exercise variation, or intensity technique.`,
    };
  }
  return null;
}

export function computeSignals(
  program: SignalProgram | null,
  logs: SignalLog[],
  nameOf: (id: string) => string,
  clientSessionsPerWeek?: number | null,
  now = Date.now()
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
        evidence: `Planned light week for “${program.name}”. Run ~60% of usual volume, no AMRAP sets.`,
        prefillNote: `This week is a planned deload (week ${week}/${ph.plannedWeeks}). Draft a light deload session set: ~60% volume, RPE cap 6, no AMRAP sets.`,
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
  const stalled = stall(program.id, programLogs, nameOf, timedExerciseIds(program));
  if (stalled) signals.push({ ...stalled, ...owner });

  return signals;
}

/** Cardio pace check, merged by each signal caller next to computeSignals.
 *  Fires when a client with a weekly target is under 60% of pro-rata pace
 *  on Thursday or later — same 0.6 threshold as the adherence rule. */
export function cardioBehindSignal(
  owner: { programId: string; clientId: string | null },
  target: CardioTarget,
  logs: CardioCountLog[],
  now: number = Date.now()
): Signal | null {
  const isoWeekday = (new Date(now).getDay() + 6) % 7 + 1; // 1=Mon … 7=Sun
  if (isoWeekday < 4) return null; // only Thu–Sun
  const label = cardioUnitLabel(target.unit);
  const done = cardioDone(target, cardioWeekTotals(logs, isoWeekStart(new Date(now))));
  const expected = Math.round(0.6 * target.value * (isoWeekday / 7));
  if (done >= expected) return null;
  const dayName = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][isoWeekday - 1];
  return {
    id: `cardio-behind:${owner.clientId}`,
    kind: "cardio-behind",
    severity: "attention",
    title: "Cardio behind weekly target",
    evidence: `${done} of ${target.value} ${label} logged this week — pace expects ≥ ${expected} by ${dayName}.`,
    programId: owner.programId,
    clientId: owner.clientId,
    altHref: `/clients/${owner.clientId}`,
    altLabel: "Review client",
  };
}
