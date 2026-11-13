import {
  findSessionType,
  MAX_SESSIONS_PER_WEEKDAY,
  placeSessions,
  placeWeeks,
  placementDayPools,
  sessionKey,
  sessionsInSeqOrder,
  normalizeGroups,
  sortExercisesByRole,
  stampWeeks,
} from "@pt/shared";
import type { AiProgramDraft, DraftExerciseRef, PlacementDaysInput, ProgramSession, ProgramWeek, RoleRank, SessionTypeLike } from "@pt/shared";

export interface CatalogLike {
  id: string;
  name: string;
  /** Feeds the placer's lower/upper focus read; absent = unknown. */
  movementPattern?: string | null;
}

/** exerciseId → movement pattern, for `placeSessions`/`placeWeeks`. */
export function patternLookup(catalog: CatalogLike[]): (exerciseId: string) => string | null | undefined {
  const byId = new Map(catalog.map((c) => [c.id, c.movementPattern]));
  return (id) => byId.get(id);
}

export type Resolution =
  | { kind: "existing"; exerciseId: string }
  | { kind: "create"; name: string }
  | { kind: "unresolvable"; ref: string };

/**
 * Map an AI draft to program sessions.
 *
 * Resolution order for each exercise reference:
 *   1. explicit exerciseId present in the catalog → use it
 *   2. case-insensitive exact name match against the catalog → use it
 *   3. name present but unknown → create a custom exercise (caller inserts)
 *   4. bogus id and no name → unresolvable; caller should 422 so the
 *      trainer regenerates or fixes the draft.
 */
export function resolveRef(
  ref: DraftExerciseRef,
  byId: Map<string, string>,
  byName: Map<string, string>
): Resolution {
  if (ref.exerciseId && byId.has(ref.exerciseId)) {
    return { kind: "existing", exerciseId: ref.exerciseId };
  }
  if (ref.exerciseName) {
    const hit = byName.get(ref.exerciseName.toLowerCase());
    if (hit) return { kind: "existing", exerciseId: hit };
    return { kind: "create", name: ref.exerciseName };
  }
  return { kind: "unresolvable", ref: ref.exerciseId ?? "<no ref>" };
}

/** Draft sessions → a one-week session template carrying the AI's suggested
 *  weekdays (unchecked; placement decides). `seq` numbers each kind's track in
 *  draft order (lifting "Session N", cardio "Cardio N"). */
export function draftTemplateSessions(
  draft: AiProgramDraft,
  catalog: CatalogLike[],
  /** Trainer's session types: a draft `type` naming one of the right format becomes typeId/typeName. */
  types: SessionTypeLike[] = [],
  /** The trainer's role labels (loadRoleLabels) — exercises sort by their ranks; absent = built-ins. */
  labels?: readonly RoleRank[],
  /** The generation's trainerOrder: keep the exercises as stored, no role sort. */
  keepOrder = false
): { sessions: ProgramSession[]; createdNames: string[]; unresolvable: string[] } {
  const byId = new Map(catalog.map((c) => [c.id, c.name.toLowerCase()]));
  const nameById = new Map(catalog.map((c) => [c.id, c.name]));
  const byName = new Map(catalog.map((c) => [c.name.toLowerCase(), c.id]));
  const createdNames: string[] = [];
  const unresolvable: string[] = [];
  const seq = { lifting: 0, cardio: 0 };

  const sessions: ProgramSession[] = draft.sessions.map((s) => {
    const isCardio = s.kind === "cardio";
    const exercises = isCardio
      ? []
      : (keepOrder ? (s.exercises ?? []) : sortExercisesByRole(s.exercises ?? [], labels)).flatMap((ref, ei) => {
          const res = resolveRef(ref, byId, byName);
          if (res.kind === "unresolvable") {
            unresolvable.push(res.ref);
            return [];
          }
          if (res.kind === "create" && !createdNames.includes(res.name)) {
            createdNames.push(res.name);
          }
          return [
            {
              id: crypto.randomUUID(),
              exerciseId:
                res.kind === "existing"
                  ? res.exerciseId
                  : `pending:${res.name.toLowerCase()}`,
              exerciseName:
                res.kind === "existing"
                  ? nameById.get(res.exerciseId)
                  : res.name,
              role: ref.role,
              order: ei,
              prescribedSets: ref.prescribedSets,
              notes: ref.notes,
              ...(ref.group ? { group: ref.group } : {}),
            },
          ];
        });
    const grouped = normalizeGroups(exercises).map((e, i) => ({ ...e, order: i }));

    const kind = isCardio ? ("cardio" as const) : ("lifting" as const);
    const type = findSessionType(types, s.type);
    return {
      id: crypto.randomUUID(),
      name: s.name,
      seq: ++seq[kind],
      weekday: s.weekday ?? null,
      order: 0,
      kind,
      ...(type && type.format === kind ? { typeId: type.id, typeName: type.name } : {}),
      notes: s.notes,
      exercises: grouped,
      cardio: isCardio ? s.cardio : null,
    };
  });

  return { sessions, createdNames, unresolvable };
}

export function draftToWeeks(
  draft: AiProgramDraft,
  catalog: CatalogLike[],
  plannedWeeks = 4,
  /** Client availability (trainingDays, cardioDays, longRunDay) or bare training days. */
  days?: PlacementDaysInput,
  types: SessionTypeLike[] = [],
  labels?: readonly RoleRank[],
  keepOrder = false
): { weeks: ProgramWeek[]; createdNames: string[]; unresolvable: string[] } {
  const { sessions, createdNames, unresolvable } = draftTemplateSessions(draft, catalog, types, labels, keepOrder);
  // AI weekdays that pass the placement rules stay; the rest are re-placed.
  const weeks = placeWeeks(stampWeeks(sessions, plannedWeeks), days, patternLookup(catalog), { keepWeekdays: true });
  return { weeks, createdNames, unresolvable };
}

/**
 * Replace weeks[weekNumber-1] with a freshly-built week from the draft (fresh
 * session/exercise ids). Placement:
 *  - a new session whose `kind:seq` existed in the old week takes that session's
 *    weekday and within-day order (the trainer's calendar survives a regen);
 *  - an unmatched session goes where `placeSessions` would put it (keeping an
 *    AI weekday that passes the rules) if that day still has room (< 4 after
 *    the matched ones), else the least-loaded day its kind may use with room,
 *    else unscheduled (null).
 *  Never more than MAX_SESSIONS_PER_WEEKDAY on a day. Other weeks pass through untouched.
 */
export function replaceWeek(
  weeks: ProgramWeek[],
  weekNumber: number,
  draft: AiProgramDraft,
  catalog: CatalogLike[],
  days?: PlacementDaysInput,
  types: SessionTypeLike[] = [],
  labels?: readonly RoleRank[],
  keepOrder = false
): { weeks: ProgramWeek[]; createdNames: string[]; unresolvable: string[] } {
  const { sessions, createdNames, unresolvable } = draftTemplateSessions(draft, catalog, types, labels, keepOrder);
  const oldWeek = weeks.find((w) => w.week === weekNumber);
  const oldAt = new Map(
    (oldWeek?.sessions ?? []).map((s) => [sessionKey(s), { weekday: s.weekday ?? null, order: s.order }])
  );
  const ideal = new Map(
    placeSessions(sessions, days, patternLookup(catalog), { keepWeekdays: true }).map((s) => [s.id, s.weekday ?? null])
  );

  const load = new Map<number, number>();
  const at = new Map<string, { weekday: number | null; order: number }>();
  const unmatched: ProgramSession[] = [];
  for (const s of sessionsInSeqOrder(sessions)) {
    const prev = oldAt.get(sessionKey(s));
    if (prev && (prev.weekday == null || (load.get(prev.weekday) ?? 0) < MAX_SESSIONS_PER_WEEKDAY)) {
      at.set(s.id, prev);
      if (prev.weekday != null) load.set(prev.weekday, (load.get(prev.weekday) ?? 0) + 1);
    } else {
      unmatched.push(s);
    }
  }
  const pools = placementDayPools(days);
  const hasRoom = (d: number) => (load.get(d) ?? 0) < MAX_SESSIONS_PER_WEEKDAY;
  for (const s of unmatched) {
    const want = ideal.get(s.id) ?? null;
    const open = (s.kind === "cardio" ? pools.cardio : pools.lifting).filter(hasRoom);
    const d =
      want != null && hasRoom(want)
        ? want
        : open.reduce<number | null>((a, b) => (a == null || (load.get(b) ?? 0) < (load.get(a) ?? 0) ? b : a), null);
    at.set(s.id, { weekday: d, order: Number.MAX_SAFE_INTEGER }); // after the day's matched sessions
    if (d != null) load.set(d, (load.get(d) ?? 0) + 1);
  }

  // Compact within-day order to 0..n-1 (matched by old order, then unmatched in seq order).
  const seqRank = new Map(sessionsInSeqOrder(sessions).map((s, i) => [s.id, i]));
  const byDay = new Map<number, ProgramSession[]>();
  for (const s of sessions) {
    const d = at.get(s.id)!.weekday ?? 0;
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const placed = new Map<string, ProgramSession>();
  for (const list of byDay.values()) {
    list
      .sort((a, b) => at.get(a.id)!.order - at.get(b.id)!.order || seqRank.get(a.id)! - seqRank.get(b.id)!)
      .forEach((s, i) => placed.set(s.id, { ...s, weekday: at.get(s.id)!.weekday, order: i }));
  }

  const newWeek: ProgramWeek = {
    week: weekNumber,
    // A re-drafted A/B week keeps its letter.
    ...(oldWeek?.rotation ? { rotation: oldWeek.rotation } : {}),
    sessions: sessions.map((s) => placed.get(s.id)!),
  };

  const updatedWeeks = weeks.map((w) => (w.week === weekNumber ? newWeek : w));
  return { weeks: updatedWeeks, createdNames, unresolvable };
}

/** Replace `pending:<name>` ids with real ids once custom exercises are inserted. */
export function bindPendingExercises(
  weeks: ProgramWeek[],
  nameToId: Map<string, string>
): ProgramWeek[] {
  return weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => ({
      ...s,
      exercises: s.exercises.map((e) => {
        if (e.exerciseId.startsWith("pending:")) {
          const name = e.exerciseId.slice("pending:".length);
          const id = nameToId.get(name);
          if (!id) throw new Error(`unresolved pending exercise: ${name}`);
          return { ...e, exerciseId: id };
        }
        return e;
      }),
    })),
  }));
}
