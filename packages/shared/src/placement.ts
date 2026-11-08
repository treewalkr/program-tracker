import {
  MAX_SESSIONS_PER_WEEKDAY,
  applyPlacementToAllWeeks,
  sessionsInSeqOrder,
  type ProgramSession,
  type ProgramWeek,
} from "./domain";

/**
 * Deterministic default placement of a week's sessions onto the client's
 * weekdays. The AI programs sessions (and may suggest weekdays); this decides
 * the calendar.
 *
 * Rules, cheapest first (the week repeats, so Sun → Mon is back-to-back):
 *  - lifting goes on trainingDays only; cardio on cardioDays ∪ trainingDays;
 *  - the long run is pinned to longRunDay when one is set;
 *  - never two key runs (long or hard) on one day;
 *  - heavy lower lifting is never the day after a key run, nor on/the day
 *    before one, and ideally ≥ 48 h before one (full-body counts a little);
 *  - lifting sessions spread out (fewest back-to-back days), keeping seq order
 *    where it costs nothing; never two lower-heavy (or upper-heavy) sessions on
 *    back-to-back days or the same day when it can be avoided;
 *  - more lifting sessions than days → stack, pairing different focuses;
 *  - easy cardio prefers its own cardio days, then days without other cardio,
 *    then days without lifting — at most one run a day when there is room;
 *  - no days at all → everything stays unscheduled.
 */

/** Client availability. A bare array is trainingDays (cardio uses the same days). */
export interface PlacementDays {
  trainingDays?: readonly number[] | null;
  /** Days cardio may use on top of trainingDays; null/absent = trainingDays. */
  cardioDays?: readonly number[] | null;
  /** Weekday the long run is pinned to. */
  longRunDay?: number | null;
}
export type PlacementDaysInput = readonly number[] | PlacementDays | null | undefined;

export interface PlaceOptions {
  /** Keep the sessions' current weekdays where they pass the rules (AI drafts). */
  keepWeekdays?: boolean;
}

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
/** Days from a to b going forward round the repeating week (0–6). */
const ahead = (a: number, b: number) => (b - a + 7) % 7;

/** Cost of two lifting focuses sitting on back-to-back days (same=true: same day). */
function clash(a: SessionFocus, b: SessionFocus, same: boolean): number {
  if (a === "none" || b === "none") return same ? 2 : 0.5;
  if (a === b && a !== "full") return same ? 8 : 6;
  // Full-body loads the legs too: next to lower or full it costs more than next to upper.
  if ((a === "full" && b !== "upper") || (b === "full" && a !== "upper")) return same ? 5 : 3;
  if (a === "full" || b === "full") return same ? 4 : 2;
  return same ? 1 : 0.5; // upper + lower: fine
}

export type CardioLoad = "long" | "hard" | "easy";

/** Key cardio (long or hard) vs easy; null for lifting. */
export function cardioLoad(s: Pick<ProgramSession, "kind" | "name" | "cardio">): CardioLoad | null {
  if (s.kind !== "cardio") return null;
  const text = `${s.name} ${s.cardio?.intensity ?? ""}`;
  if ((s.cardio?.durationMin ?? 0) >= 60 || /\blong\b/i.test(text)) return "long";
  if ((s.cardio?.hrZone ?? 0) >= 4 || /tempo|threshold|interval/i.test(text)) return "hard";
  return "easy";
}

const normDays = (days?: readonly number[] | null) =>
  [...new Set(days ?? [])].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);

function resolveDays(input: PlacementDaysInput) {
  const d: PlacementDays = Array.isArray(input) ? { trainingDays: input as readonly number[] } : ((input ?? {}) as PlacementDays);
  const lifting = normDays(d.trainingDays);
  const explicit = d.cardioDays != null && d.cardioDays.length > 0;
  const long = d.longRunDay != null && d.longRunDay >= 1 && d.longRunDay <= 7 ? d.longRunDay : null;
  const cardio = normDays([...lifting, ...(explicit ? d.cardioDays! : []), ...(long ? [long] : [])]);
  // Explicit cardio days are the preferred ones (the long-run day counts too).
  const preferred = explicit ? new Set(normDays([...d.cardioDays!, ...(long ? [long] : [])])) : null;
  return { lifting, cardio, preferred, longRunDay: long };
}

type Ctx = {
  focus: Map<string, SessionFocus>;
  load: Map<string, CardioLoad | null>;
  preferred: Set<number> | null;
};

const lowerWeight = (f: SessionFocus | undefined) => (f === "lower" ? 1 : f === "full" ? 0.3 : 0);
const isKey = (l: CardioLoad | null | undefined) => l === "long" || l === "hard";

/** Total cost of a (partial) week: every rule above as a soft cost. */
function weekCost(entries: readonly (readonly [ProgramSession, number])[], ctx: Ctx): number {
  let cost = 0;
  const liftDays = new Set<number>();
  for (const [s, d] of entries) {
    if (s.kind === "lifting") liftDays.add(d);
    else if (ctx.preferred && !ctx.preferred.has(d)) cost += 1.5;
  }
  // Even spread of lifting days around the (repeating) week: small cost per tight gap.
  const ld = [...liftDays].sort((a, b) => a - b);
  for (let i = 0; i < ld.length && ld.length > 1; i++) cost += 0.1 / (ahead(ld[i], ld[(i + 1) % ld.length]) || 7);

  for (let i = 0; i < entries.length; i++) {
    const [a, da] = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const [b, db] = entries[j];
      const same = da === db;
      if (a.kind === "lifting" && b.kind === "lifting") {
        if (same || adjacent(da, db)) cost += clash(ctx.focus.get(a.id)!, ctx.focus.get(b.id)!, same);
        if ((a.seq < b.seq) !== (da <= db) && !same) cost += 0.01; // keep Session 1 earliest…
        continue;
      }
      if (a.kind === "cardio" && b.kind === "cardio") {
        const ka = isKey(ctx.load.get(a.id));
        const kb = isKey(ctx.load.get(b.id));
        if (ka && kb) cost += same ? 100 : adjacent(da, db) ? 2 : 0;
        else if (same) cost += 5;
        continue;
      }
      const [l, dl, c, dc] = a.kind === "lifting" ? [a, da, b, db] : [b, db, a, da];
      if (same) cost += 1;
      if (!isKey(ctx.load.get(c.id))) continue;
      const w = lowerWeight(ctx.focus.get(l.id));
      if (w === 0) continue;
      const gap = ahead(dl, dc); // days from the lift to the key run
      cost += w * (gap === 0 ? 20 : gap === 1 ? 10 : gap === 2 ? 3 : gap === 6 ? 100 : 0);
    }
  }
  return cost;
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

/** The session the long-run day pins: the longest "long" cardio session. */
function longRunOf(cardio: readonly ProgramSession[], load: Map<string, CardioLoad | null>): ProgramSession | null {
  let best: ProgramSession | null = null;
  for (const s of cardio) {
    if (load.get(s.id) !== "long") continue;
    if (!best || (s.cardio?.durationMin ?? 0) > (best.cardio?.durationMin ?? 0)) best = s;
  }
  return best;
}

export type PlacementRule =
  | "off-day"
  | "long-run-day"
  | "key-runs-same-day"
  | "lower-after-key"
  | "lower-before-key"
  | "day-full";

export interface PlacementConflict {
  rule: PlacementRule;
  /** Session ids involved, the one to move first. */
  sessionIds: string[];
  text: string;
}

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayName = (d: number) => DAY[d - 1] ?? `day ${d}`;

/** Hard-rule breaks in a week's current weekdays (unscheduled sessions are ignored). */
export function placementConflicts(
  sessions: readonly ProgramSession[],
  days: PlacementDaysInput,
  patternOf?: PatternOf
): PlacementConflict[] {
  const { lifting, cardio, longRunDay } = resolveDays(days);
  const placed = sessionsInSeqOrder(sessions).filter((s) => s.weekday != null);
  const load = new Map(sessions.map((s) => [s.id, cardioLoad(s)]));
  const out: PlacementConflict[] = [];
  const perDay = new Map<number, ProgramSession[]>();
  for (const s of placed) {
    const d = s.weekday!;
    perDay.set(d, [...(perDay.get(d) ?? []), s]);
    const allowed = s.kind === "lifting" ? lifting : cardio;
    if (allowed.length > 0 && !allowed.includes(d)) {
      out.push({
        rule: "off-day",
        sessionIds: [s.id],
        text: `"${s.name}" is on ${dayName(d)}, not one of the client's ${s.kind === "lifting" ? "lifting" : "cardio"} days`,
      });
    }
  }
  for (const [d, list] of perDay) {
    if (list.length > MAX_SESSIONS_PER_WEEKDAY) {
      out.push({ rule: "day-full", sessionIds: list.slice(MAX_SESSIONS_PER_WEEKDAY).map((s) => s.id), text: `${dayName(d)} has more than ${MAX_SESSIONS_PER_WEEKDAY} sessions` });
    }
  }
  const long = longRunDay != null ? longRunOf(sessions.filter((s) => s.kind === "cardio"), load) : null;
  if (long && long.weekday != null && long.weekday !== longRunDay) {
    out.push({ rule: "long-run-day", sessionIds: [long.id], text: `"${long.name}" is on ${dayName(long.weekday)}; the long-run day is ${dayName(longRunDay!)}` });
  }
  const keys = placed.filter((s) => isKey(load.get(s.id)));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (keys[i].weekday === keys[j].weekday) {
        // Move the shorter / non-long one first.
        const [a, b] = load.get(keys[j].id) === "long" ? [keys[i], keys[j]] : [keys[j], keys[i]];
        out.push({ rule: "key-runs-same-day", sessionIds: [a.id, b.id], text: `"${keys[i].name}" and "${keys[j].name}" are both key runs on ${dayName(a.weekday!)}` });
      }
    }
  }
  for (const l of placed) {
    if (sessionFocus(l, patternOf) !== "lower") continue;
    for (const k of keys) {
      const gap = ahead(l.weekday!, k.weekday!);
      if (gap === 6) {
        out.push({ rule: "lower-after-key", sessionIds: [l.id, k.id], text: `Heavy lower "${l.name}" on ${dayName(l.weekday!)} is the day after "${k.name}"` });
      } else if (gap <= 1) {
        out.push({
          rule: "lower-before-key",
          sessionIds: [l.id, k.id],
          text: `Heavy lower "${l.name}" on ${dayName(l.weekday!)} is ${gap === 0 ? "the same day as" : "the day before"} "${k.name}"`,
        });
      }
    }
  }
  return out;
}

/** Return the sessions with `weekday` and within-day `order` set. Content untouched. */
export function placeSessions(
  sessions: readonly ProgramSession[],
  days?: PlacementDaysInput,
  patternOf?: PatternOf,
  opts: PlaceOptions = {}
): ProgramSession[] {
  const avail = resolveDays(days);
  const ordered = sessionsInSeqOrder(sessions);
  if (avail.lifting.length === 0 && avail.cardio.length === 0) {
    return ordered.map((s, i) => ({ ...s, weekday: null, order: i }));
  }

  const lifting = ordered.filter((s) => s.kind === "lifting");
  const cardio = ordered.filter((s) => s.kind === "cardio");
  const ctx: Ctx = {
    focus: new Map(lifting.map((s) => [s.id, sessionFocus(s, patternOf)])),
    load: new Map(cardio.map((s) => [s.id, cardioLoad(s)])),
    preferred: avail.preferred,
  };
  const fixed: [ProgramSession, number][] = [];
  const isFixed = new Set<string>();
  const count = (entries: readonly (readonly [ProgramSession, number])[], d: number) => entries.filter(([, x]) => x === d).length;
  const fix = (s: ProgramSession, d: number) => {
    fixed.push([s, d]);
    isFixed.add(s.id);
  };

  // 0. The long run goes on the long-run day.
  const long = avail.longRunDay != null ? longRunOf(cardio, ctx.load) : null;
  if (long) fix(long, avail.longRunDay!);

  // 0b. Suggested weekdays (AI drafts) stay where they break no rule. Key runs
  //     first, then lifting, then easy cardio: the expensive sessions win a day.
  if (opts.keepWeekdays) {
    const rank = (s: ProgramSession) => (isKey(ctx.load.get(s.id)) ? 0 : s.kind === "lifting" ? 1 : 2);
    const candidates = ordered.filter((s) => s.weekday != null && !isFixed.has(s.id)).sort((a, b) => rank(a) - rank(b));
    for (const s of candidates) {
      const d = s.weekday!;
      if (count(fixed, d) >= MAX_SESSIONS_PER_WEEKDAY) continue;
      const trial = [...fixed.map(([x, xd]) => ({ ...x, weekday: xd })), { ...s, weekday: d }];
      const broken = placementConflicts(trial, days, patternOf).some((c) => c.sessionIds.includes(s.id));
      if (!broken) fix(s, d);
    }
  }

  const hasRoom = (entries: readonly (readonly [ProgramSession, number])[], d: number) => count(entries, d) < MAX_SESSIONS_PER_WEEKDAY;
  /** Cheapest day for s among `pool`, given what is already placed (earliest day on a tie). */
  const bestDay = (entries: [ProgramSession, number][], s: ProgramSession, pool: number[]) => {
    let best: { d: number; cost: number } | null = null;
    for (const d of pool) {
      if (!hasRoom(entries, d)) continue;
      const cost = weekCost([...entries, [s, d]], ctx);
      if (!best || cost < best.cost - 1e-9) best = { d, cost };
    }
    return best?.d ?? null;
  };
  const freeLifting = lifting.filter((s) => !isFixed.has(s.id));
  const freeKeys = cardio
    .filter((s) => !isFixed.has(s.id) && isKey(ctx.load.get(s.id)))
    .sort((a, b) => (ctx.load.get(a.id) === "long" ? 0 : 1) - (ctx.load.get(b.id) === "long" ? 0 : 1));
  const placeKeys = (entries: [ProgramSession, number][]) => {
    for (const s of freeKeys) {
      const d = bestDay(entries, s, avail.cardio);
      if (d != null) entries.push([s, d]);
    }
    return entries;
  };

  // 1. One lifting session per free lifting day for as many days as we have:
  //    brute force the day subset and the order (≤ 7 sessions, ≤ 7 days), with
  //    the key runs placed greedily against each candidate.
  const liftTaken = new Set(fixed.filter(([s]) => s.kind === "lifting").map(([, d]) => d));
  const freeDays = avail.lifting.filter((d) => !liftTaken.has(d) && hasRoom(fixed, d));
  const head = freeLifting.slice(0, freeDays.length);
  let placed: [ProgramSession, number][] = [...fixed];
  if (head.length > 0) {
    let best: { cost: number; entries: [ProgramSession, number][] } | null = null;
    const perms = head.length <= 6 ? [...permutations(head)] : [head];
    for (const combo of combinations(freeDays.length, head.length)) {
      const chosen = combo.map((i) => freeDays[i]);
      for (const perm of perms) {
        const entries = placeKeys([...fixed, ...perm.map((s, i) => [s, chosen[i]] as [ProgramSession, number])]);
        const cost = weekCost(entries, ctx);
        if (!best || cost < best.cost - 1e-9) best = { cost, entries };
      }
    }
    placed = best!.entries;
  } else {
    placed = placeKeys(placed);
  }

  // 2. Extra lifting sessions stack on the day where they cost least.
  for (const s of freeLifting.slice(head.length)) {
    const d = bestDay(placed, s, avail.lifting);
    if (d != null) placed.push([s, d]);
  }

  // 3. Easy cardio, in seq order.
  for (const s of cardio) {
    if (isFixed.has(s.id) || isKey(ctx.load.get(s.id))) continue;
    const d = bestDay(placed, s, avail.cardio);
    if (d != null) placed.push([s, d]);
  }

  const byDay = new Map<number, ProgramSession[]>();
  for (const [s, d] of placed) byDay.set(d, [...(byDay.get(d) ?? []), s]);
  const onCalendar = new Set(placed.map(([s]) => s.id));

  const out: ProgramSession[] = [];
  for (const [d, list] of [...byDay].sort((a, b) => a[0] - b[0])) {
    // Within a day: lifting first (seq order), cardio after.
    sessionsInSeqOrder(list).forEach((s, i) => out.push({ ...s, weekday: d, order: i }));
  }
  ordered.filter((s) => !onCalendar.has(s.id)).forEach((s, i) => out.push({ ...s, weekday: null, order: i }));
  return sessionsInSeqOrder(out);
}

/** Place week 1 by the rules and give every week the same placement. */
export function placeWeeks(
  weeks: ProgramWeek[],
  days?: PlacementDaysInput,
  patternOf?: PatternOf,
  opts: PlaceOptions = {}
): ProgramWeek[] {
  if (weeks.length === 0) return weeks;
  const first = weeks[0];
  const placedFirst = { ...first, sessions: placeSessions(first.sessions, days, patternOf, opts) };
  return applyPlacementToAllWeeks([placedFirst, ...weeks.slice(1)], first.week);
}
