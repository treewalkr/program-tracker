import { estimate1rm } from "@pt/shared";
import type { ProgramDto, SessionLogDto } from "$lib/api/types";
import { blockPulse, pulseSummary } from "$lib/metrics";

/**
 * Phase-change signals: deterministic rules over (program, logs).
 * Computed on read — no background jobs. Trainer decides, system suggests.
 * Later: same rules run server-side (move to packages/shared).
 */

export type SignalKind =
  | "block-ending"
  | "deload-week"
  | "transition-due"
  | "off-plan"
  | "rpe-creep"
  | "stall"
  | "adherence";

export interface Signal {
  id: string;
  kind: SignalKind;
  severity: "info" | "attention" | "urgent";
  title: string;
  evidence: string;
  /** Pre-filled note for the generate flow, when the signal warrants a new block. */
  prefillNote?: string;
  /** Template id to auto-toggle on the generate flow. */
  templateHint?: string;
  /** Alternative action when generating isn't the answer. */
  altHref?: string;
  altLabel?: string;
}

export function weekOf(program: ProgramDto, logs: SessionLogDto[]): number {
  const programLogs = logs.filter((l) => l.programId === program.id);
  const start =
    program.activatedAt ??
    programLogs.map((l) => l.date).sort()[0] ??
    program.createdAt;
  const days = (Date.now() - new Date(start).getTime()) / 86400_000;
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** Same load getting harder: avg RPE at identical weight, latest vs earliest week. */
function rpeCreep(logs: SessionLogDto[], nameOf: (id: string) => string): Signal | null {
  const byWeight = new Map<string, { weeks: Map<string, { rpeSum: number; n: number }> }>();
  for (const log of logs.sort((a, b) => a.date.localeCompare(b.date))) {
    const week = log.date.slice(0, 10);
    for (const s of log.sets) {
      if (s.type !== "working" || !s.weightKg || !s.rpe) continue;
      const key = `${s.exerciseId}@${s.weightKg}`;
      let entry = byWeight.get(key);
      if (!entry) {
        entry = { weeks: new Map() };
        byWeight.set(key, entry);
      }
      const w = entry.weeks.get(week) ?? { rpeSum: 0, n: 0 };
      w.rpeSum += s.rpe;
      w.n += 1;
      entry.weeks.set(week, w);
    }
  }

  let worst: { ex: string; weight: number; delta: number } | null = null;
  for (const [key, entry] of byWeight) {
    const weeks = [...entry.weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (weeks.length < 2) continue;
    const first = weeks[0][1];
    const last = weeks[weeks.length - 1][1];
    if (last.n < 2 || first.n < 1) continue;
    const delta = (last.rpeSum / last.n) - (first.rpeSum / first.n);
    if (delta >= 1.5 && (!worst || delta > worst.delta)) {
      const [exId, weight] = key.split("@");
      worst = { ex: nameOf(exId), weight: Number(weight), delta };
    }
  }
  if (!worst) return null;
  return {
    id: `rpe-creep:${worst.ex}`,
    kind: "rpe-creep",
    severity: "attention",
    title: `Fatigue signal — ${worst.ex}`,
    evidence: `${worst.weight} kg now rates +${worst.delta.toFixed(1)} RPE vs first week at the same load.`,
    prefillNote: `Fatigue is building: ${worst.ex} at ${worst.weight} kg rates ~+${worst.delta.toFixed(1)} RPE higher than at block start. Consider a deload or a lighter week before progressing.`,
    templateHint: "tpl-block-structure",
  };
}

/** e1RM flat across recent weeks while peak was earlier in the block. */
function stall(logs: SessionLogDto[], nameOf: (id: string) => string): Signal | null {
  const weeklyBest = new Map<string, Map<string, number>>();
  for (const log of logs) {
    const week = log.date.slice(0, 10);
    for (const s of log.sets) {
      if (s.type !== "working" || !s.weightKg || s.reps > 12) continue;
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
      id: `stall:${exId}`,
      kind: "stall",
      severity: "attention",
      title: `${name} plateaued`,
      evidence: `Best estimated 1RM has not moved in the last 2 weeks (peak ${Math.round(peak)} kg).`,
      prefillNote: `${name} has stalled — estimated 1RM flat for 2 weeks. Change the stimulus in the next block: new rep range, exercise variation, or intensity technique.`,
    };
  }
  return null;
}

export function computeSignals(
  program: ProgramDto | null,
  logs: SessionLogDto[],
  nameOf: (id: string) => string,
  clientDaysPerWeek?: number | null
): Signal[] {
  if (!program || program.status !== "active") return [];
  const signals: Signal[] = [];
  const week = weekOf(program, logs);
  const ph = program.phasing;
  const programLogs = logs.filter((l) => l.programId === program.id);

  if (ph) {
    const scheme = ph.weeks ?? [];
    const hasTransition = scheme.some((w) => w.directive === "transition");
    const directive = scheme.find((w) => w.week === week)?.directive ?? null;
    const pulse = blockPulse(program, programLogs);
    const summary = pulseSummary(pulse);
    const isDeloadWeek = ph.deloadWeeks.includes(week) || directive === "deload";
    if (isDeloadWeek && week <= ph.plannedWeeks) {
      signals.push({
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
        id: `transition:${program.id}:w${week}`,
        kind: "transition-due",
        severity: "attention",
        title: `Transition week ${week} — draft the shift`,
        evidence: `Scheme says transition: introduce movement variants, cut volume ~20%.${summary ? ` Block so far: ${summary}.` : ""}`,
        prefillNote: `Transition week (${week}/${ph.plannedWeeks}) of the ${ph.phase} block: shift toward ${ph.nextPhase ?? "the next phase"}. Cut volume ~20%, introduce variant movements, hold loads steady.`,
        templateHint: "tpl-block-structure",
      });
    }

    const cur = pulse.find((w) => w.week === week);
    const prev = pulse.find((w) => w.week === week - 1);
    if (cur && prev && !cur.plannedOnly && !prev.plannedOnly) {
      const t = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`);
      if (directive === "+volume" && prev.tonnage > 0 && cur.tonnage <= prev.tonnage * 1.03) {
        signals.push({
          id: `offplan-vol:${program.id}:w${week}`,
          kind: "off-plan",
          severity: "attention",
          title: `Planned +volume — tonnage came in flat`,
          evidence: `Week ${week} directive is +volume, but logged tonnage is ${t(cur.tonnage)} vs ${t(prev.tonnage)} last week. Add a set, or check what got skipped.`,
          prefillNote: `Week ${week} should add volume but last week came in flat — draft this week's sessions with one extra working set on the main lifts.`,
        });
      }
      if (directive === "+intensity" && prev.bestE1rm > 0 && cur.bestE1rm <= prev.bestE1rm * 1.01) {
        signals.push({
          id: `offplan-int:${program.id}:w${week}`,
          kind: "off-plan",
          severity: "attention",
          title: `Planned +intensity — best e1RM didn't move`,
          evidence: `Week ${week} directive is +intensity, best e1RM is ${Math.round(cur.bestE1rm)} vs ${Math.round(prev.bestE1rm)} last week. Repeat the loads, or consider the early transition.`,
          prefillNote: `Week ${week} should push intensity but loads stalled — draft sessions that repeat last week's loads with a rep target bump instead.`,
        });
      }
      if (directive === "+volume" && cur.avgRpe != null && cur.avgRpe >= 8.5 && (prev.avgRpe ?? 0) < cur.avgRpe) {
        signals.push({
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

  // Adherence: sessions logged vs planned per week — planned comes from the CLIENT's
  // training days when known (a 2-day/week client on a 3-day program is not slacking).
  // Suppressed near block end — the block-ending review already brings the trainer in.
  const phaseSignalExists = signals.some((s) => s.kind === "block-ending" || s.kind === "deload-week");
  const weeksRun = Math.max(1, week);
  const perWeek = clientDaysPerWeek ?? program.sessions.length;
  const expected = perWeek * weeksRun;
  const logged = programLogs.length;
  if (!phaseSignalExists && expected >= 4 && logged / expected < 0.6) {
    signals.push({
      id: `adherence:${program.id}`,
      kind: "adherence",
      severity: "attention",
      title: "Low adherence — check in",
      evidence: `${logged} of ~${expected} planned sessions logged since the block started.`,
      altHref: `/clients/${program.clientId}`,
      altLabel: "Review client",
    });
  }

  const creep = rpeCreep(programLogs, nameOf);
  if (creep) signals.push(creep);
  const stalled = stall(programLogs, nameOf);
  if (stalled) signals.push(stalled);

  return signals;
}

/* ---- Snooze (mock: localStorage; real API later: snooze table) ---- */

const SNOOZE_KEY = "pt-snoozed-signals";

function snoozeMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function snoozeSignal(id: string, days = 7) {
  const map = snoozeMap();
  map[id] = new Date(Date.now() + days * 86400_000).toISOString();
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

export function isSnoozed(id: string): boolean {
  const until = snoozeMap()[id];
  return !!until && new Date(until).getTime() > Date.now();
}

export function activeSignals(signals: Signal[]): Signal[] {
  return signals.filter((s) => !isSnoozed(s.id));
}
