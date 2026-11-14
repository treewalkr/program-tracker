import { isAlternating, rotationOfWeek, sessionKey, type Phasing, type PrescribedSet, type ProgramExercise, type ProgramSession, type ProgramWeek, type WeekProgression } from "./domain";

// ---------------------------------------------------------------------------
// Block progression: generate weeks 2…n from week 1 with each week's rule. Pure.
// ---------------------------------------------------------------------------

const MAX_SETS = 20;
const round = (v: number, step: number) => Math.round(v / step) * step;

/** "+2.5 kg", "−5%", "+1 set", "+2 sets". */
export function progressionLabel(p: WeekProgression): string {
  const sign = p.amount > 0 ? "+" : "−";
  const n = Math.abs(p.amount);
  if (p.kind === "kg") return `${sign}${n} kg`;
  if (p.kind === "percent") return `${sign}${n}% 1RM`;
  return `${sign}${n} ${n === 1 ? "set" : "sets"}`;
}

function progressSet(ps: PrescribedSet, rule: WeekProgression): PrescribedSet {
  if (ps.durationSeconds != null) return { ...ps };
  if (rule.kind === "kg") {
    return ps.targetWeightKg != null ? { ...ps, targetWeightKg: Math.max(0, ps.targetWeightKg + rule.amount) } : { ...ps };
  }
  if (rule.kind === "percent") {
    if (ps.percent1rm != null) return { ...ps, percent1rm: Math.min(110, Math.max(1, ps.percent1rm + rule.amount)) };
    if (ps.targetWeightKg != null) return { ...ps, targetWeightKg: Math.max(0, round(ps.targetWeightKg * (1 + rule.amount / 100), 0.5)) };
  }
  return { ...ps };
}

/** Add (copies of the last working set, before the back-offs) or remove working sets; ≥ 1 working set, ≤ 20 sets. */
function progressSets(sets: PrescribedSet[], amount: number): PrescribedSet[] {
  const working = sets.filter((s) => s.type !== "backoff");
  const backoff = sets.filter((s) => s.type === "backoff");
  if (working.length === 0) return sets.map((s) => ({ ...s }));
  const target = Math.max(1, Math.min(MAX_SETS - backoff.length, working.length + amount));
  const next = working.slice(0, target).map((s) => ({ ...s }));
  while (next.length < target) next.push({ ...working[working.length - 1] });
  return [...next, ...backoff.map((s) => ({ ...s }))].map((s, i) => ({ ...s, setNumber: i + 1 }));
}

function progressExercise(e: ProgramExercise, rule: WeekProgression | undefined): ProgramExercise {
  if (!rule) return { ...e, prescribedSets: e.prescribedSets.map((s) => ({ ...s })) };
  const sets = rule.kind === "sets" ? progressSets(e.prescribedSets, rule.amount) : e.prescribedSets.map((s) => progressSet(s, rule));
  return { ...e, prescribedSets: sets };
}

/** Copy `base` as week `week`, reusing ids from `existing` where the same session/exercise is already there. */
function deriveWeek(base: ProgramWeek, week: number, rule: WeekProgression | undefined, existing: ProgramWeek | undefined): ProgramWeek {
  const sessions: ProgramSession[] = base.sessions.map((s) => {
    const old = existing?.sessions.find((x) => sessionKey(x) === sessionKey(s));
    return {
      ...s,
      id: old?.id ?? crypto.randomUUID(),
      cardio: s.cardio ? { ...s.cardio } : s.cardio,
      exercises: s.exercises.map((e, i) => {
        const oldEx = old?.exercises[i]?.exerciseId === e.exerciseId ? old.exercises[i] : undefined;
        return { ...progressExercise(e, s.kind === "lifting" ? rule : undefined), id: oldEx?.id ?? crypto.randomUUID() };
      }),
    };
  });
  return base.rotation ? { week, rotation: rotationOfWeek(week), sessions } : { week, sessions };
}

/**
 * Weeks 1…plannedWeeks generated from week 1: each week applies its
 * `progression` rule to the week before (no rule = a copy). Week 1 is returned
 * as-is. A deload week without a rule keeps its own sets (when it exists), and
 * the week after a deload builds on the last non-deload week. Existing session
 * and exercise ids are reused so logged sets stay linked.
 *
 * Alternating (A/B) blocks progress each letter on its own track: the first
 * week of each letter is kept as written (W1 A, W2 B), and a later week builds
 * on the last non-deload week with its letter (W5 from W3, W6 from W4).
 */
export function applyProgression(weeks: ProgramWeek[], phasing: Pick<Phasing, "plannedWeeks" | "weeks">): ProgramWeek[] {
  return progressBlock(weeks, phasing).weeks;
}

/** `applyProgression`, plus the weeks kept as written because they start their
 *  letter's track (`firstOfLetter`: [2] for a usual A/B block). */
export function progressBlock(
  weeks: ProgramWeek[],
  phasing: Pick<Phasing, "plannedWeeks" | "weeks">
): { weeks: ProgramWeek[]; firstOfLetter: number[] } {
  const firstOfLetter: number[] = [];
  const w1 = weeks.find((w) => w.week === 1);
  if (!w1) return { weeks, firstOfLetter };
  const alternating = isAlternating(weeks);
  const planOf = (n: number) => phasing.weeks?.find((p) => p.week === n);
  const out: ProgramWeek[] = [w1];
  // Last non-deload output week per letter ("" = the only track when not alternating).
  const base = new Map<string, ProgramWeek>([[alternating ? "A" : "", w1]]);
  for (let n = 2; n <= phasing.plannedWeeks; n++) {
    const plan = planOf(n);
    const existing = weeks.find((w) => w.week === n);
    const track = alternating ? rotationOfWeek(n) : "";
    const from = base.get(track);
    if (!from) {
      // First week of this letter: kept as written; with nothing written, start from A.
      const first = existing ?? deriveWeek(w1, n, undefined, undefined);
      const tagged = { ...first, rotation: rotationOfWeek(n) };
      out.push(tagged);
      firstOfLetter.push(n);
      if (plan?.directive !== "deload") base.set(track, tagged);
      continue;
    }
    if (plan?.directive === "deload" && !plan.progression && existing) {
      out.push(existing);
      continue;
    }
    const next = deriveWeek(from, n, plan?.progression, existing);
    out.push(next);
    if (plan?.directive !== "deload") base.set(track, next);
  }
  return { weeks: out, firstOfLetter };
}
