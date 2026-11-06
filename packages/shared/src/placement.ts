import {
  MAX_SESSIONS_PER_WEEKDAY,
  applyPlacementToAllWeeks,
  sessionsInSeqOrder,
  type ProgramSession,
  type ProgramWeek,
} from "./domain";

/**
 * Deterministic default placement of a week's sessions onto the client's
 * training weekdays. The AI only programs sessions; this decides the calendar.
 *
 * Rules, cheapest first:
 *  - lifting sessions spread out (fewest back-to-back days), keeping seq order
 *    where it costs nothing;
 *  - never two lower-body-heavy sessions on back-to-back days or the same day
 *    when it can be avoided (same for two upper-heavy ones);
 *  - more lifting sessions than days → stack, pairing different focuses;
 *  - cardio prefers training days without lifting, then the lightest day;
 *  - no training days → everything stays unscheduled.
 */

export type SessionFocus = "lower" | "upper" | "full" | "none";

type PatternOf = (exerciseId: string) => string | null | undefined;

const LOWER = new Set(["knee_dominant", "hip_dominant"]);
const UPPER = new Set(["vertical_push", "horizontal_push", "vertical_pull", "horizontal_pull"]);

/** What a lifting session mostly loads, from its exercises' movement patterns. */
export function sessionFocus(s: Pick<ProgramSession, "kind" | "exercises">, patternOf?: PatternOf): SessionFocus {
  if (s.kind !== "lifting" || !patternOf) return "none";
  let lower = 0;
  let upper = 0;
  for (const e of s.exercises) {
    const p = patternOf(e.exerciseId);
    if (p && LOWER.has(p)) lower++;
    else if (p && UPPER.has(p)) upper++;
  }
  if (lower === 0 && upper === 0) return "none";
  if (lower >= upper * 2) return "lower";
  if (upper >= lower * 2) return "upper";
  return "full";
}

const adjacent = (a: number, b: number) => Math.abs(a - b) === 1 || Math.abs(a - b) === 6;

/** Cost of two lifting focuses sitting on back-to-back days (same=true: same day). */
function clash(a: SessionFocus, b: SessionFocus, same: boolean): number {
  if (a === "none" || b === "none") return same ? 2 : 0.5;
  if (a === b && a !== "full") return same ? 8 : 6;
  if (a === "full" || b === "full") return same ? 4 : 2;
  return same ? 1 : 0.5; // upper + lower: fine
}

function* combinations(n: number, k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) return yield [...acc];
  for (let i = start; i <= n - (k - acc.length); i++) {
    acc.push(i);
    yield* combinations(n, k, i + 1, acc);
    acc.pop();
  }
}

function* permutations<T>(xs: T[]): Generator<T[]> {
  if (xs.length <= 1) return yield [...xs];
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const p of permutations(rest)) yield [xs[i], ...p];
  }
}

/** Return the sessions with `weekday` and within-day `order` set. Content untouched. */
export function placeSessions(
  sessions: readonly ProgramSession[],
  trainingDays?: readonly number[] | null,
  patternOf?: PatternOf
): ProgramSession[] {
  const days = [...new Set(trainingDays ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const ordered = sessionsInSeqOrder(sessions);
  if (days.length === 0) {
    return ordered.map((s, i) => ({ ...s, weekday: null, order: i }));
  }

  const lifting = ordered.filter((s) => s.kind === "lifting");
  const cardio = ordered.filter((s) => s.kind === "cardio");
  const focus = new Map(lifting.map((s) => [s.id, sessionFocus(s, patternOf)]));
  const placed = new Map<number, ProgramSession[]>(days.map((d) => [d, []]));

  // 1. One lifting session per day for as many days as we have: brute force the
  //    day subset and the order (≤ 7 sessions, ≤ 7 days — at most a few thousand).
  const head = lifting.slice(0, days.length);
  if (head.length > 0) {
    let best: { cost: number; assign: [ProgramSession, number][] } | null = null;
    const perms = head.length <= 6 ? [...permutations(head)] : [head];
    for (const combo of combinations(days.length, head.length)) {
      const chosen = combo.map((i) => days[i]);
      // Even spread around the (repeating) week: small cost per tight gap.
      let spread = 0;
      for (let i = 0; i < chosen.length && chosen.length > 1; i++) {
        const gap = (chosen[(i + 1) % chosen.length] - chosen[i] + 7) % 7 || 7;
        spread += 0.1 / gap;
      }
      for (const perm of perms) {
        let cost = spread;
        for (let i = 0; i < perm.length; i++) {
          for (let j = i + 1; j < perm.length; j++) {
            if (adjacent(chosen[i], chosen[j])) cost += clash(focus.get(perm[i].id)!, focus.get(perm[j].id)!, false);
          }
          // Prefer keeping Session 1 earliest, Session 2 next…
          for (let j = i + 1; j < perm.length; j++) if (perm[j].seq < perm[i].seq) cost += 0.01;
        }
        if (!best || cost < best.cost - 1e-9) best = { cost, assign: perm.map((s, i) => [s, chosen[i]]) };
      }
    }
    for (const [s, d] of best!.assign) placed.get(d)!.push(s);
  }

  // 2. Extra lifting sessions stack on the day where they clash least.
  const dayCost = (d: number, f: SessionFocus, sameWeight = 1) => {
    let c = 0;
    for (const o of placed.get(d)!) if (o.kind === "lifting") c += clash(f, focus.get(o.id)!, true) * sameWeight;
    for (const n of days) {
      if (n === d || !adjacent(n, d)) continue;
      for (const o of placed.get(n)!) if (o.kind === "lifting") c += clash(f, focus.get(o.id)!, false);
    }
    return c;
  };
  for (const s of lifting.slice(days.length)) {
    const open = days.filter((d) => placed.get(d)!.length < MAX_SESSIONS_PER_WEEKDAY);
    const d = open.reduce((a, b) => (dayCost(b, focus.get(s.id)!) < dayCost(a, focus.get(s.id)!) ? b : a), open[0]);
    if (d == null) continue;
    placed.get(d)!.push(s);
  }

  // 3. Cardio: rest days first, then the day carrying the least.
  const unscheduled: ProgramSession[] = [];
  for (const s of cardio) {
    const load = (d: number) =>
      placed.get(d)!.reduce((n, o) => n + (o.kind === "lifting" ? 3 : 2), 0);
    const open = days.filter((d) => placed.get(d)!.length < MAX_SESSIONS_PER_WEEKDAY);
    if (open.length === 0) {
      unscheduled.push(s);
      continue;
    }
    const d = open.reduce((a, b) => (load(b) < load(a) ? b : a), open[0]);
    placed.get(d)!.push(s);
  }

  // Lifting sessions (not yet placed when every day is full) fall to unscheduled too.
  const onCalendar = new Set([...placed.values()].flat().map((s) => s.id));
  for (const s of lifting) if (!onCalendar.has(s.id)) unscheduled.push(s);

  const out: ProgramSession[] = [];
  for (const [d, list] of placed) {
    // Within a day: lifting first (seq order), cardio after.
    sessionsInSeqOrder(list).forEach((s, i) => out.push({ ...s, weekday: d, order: i }));
  }
  unscheduled.forEach((s, i) => out.push({ ...s, weekday: null, order: i }));
  return sessionsInSeqOrder(out);
}

/** Place week 1 by the rules and give every week the same placement. */
export function placeWeeks(
  weeks: ProgramWeek[],
  trainingDays?: readonly number[] | null,
  patternOf?: PatternOf
): ProgramWeek[] {
  if (weeks.length === 0) return weeks;
  const first = weeks[0];
  const placedFirst = { ...first, sessions: placeSessions(first.sessions, trainingDays, patternOf) };
  return applyPlacementToAllWeeks([placedFirst, ...weeks.slice(1)], first.week);
}
