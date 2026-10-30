import { applyDefaultWeekdays, sortExercisesByRole, stampWeeks } from "@pt/shared";
import type {
  AiProgramDraft,
  DraftExerciseRef,
  ProgramDay,
  ProgramSession,
  ProgramWeek,
} from "@pt/shared";

export interface CatalogLike {
  id: string;
  name: string;
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

export function draftToWeeks(
  draft: AiProgramDraft,
  catalog: CatalogLike[],
  plannedWeeks = 4,
  trainingDays?: number[] | null
): { weeks: ProgramWeek[]; createdNames: string[]; unresolvable: string[] } {
  const byId = new Map(catalog.map((c) => [c.id, c.name.toLowerCase()]));
  const nameById = new Map(catalog.map((c) => [c.id, c.name]));
  const byName = new Map(catalog.map((c) => [c.name.toLowerCase(), c.id]));
  const createdNames: string[] = [];
  const unresolvable: string[] = [];

  const templateDays: ProgramDay[] = draft.sessions.map((s, si) => {
    const isCardio = (s as any).kind === "cardio";
    const exercises = isCardio
      ? []
      : sortExercisesByRole(s.exercises ?? []).flatMap((ref, ei) => {
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
            },
          ];
        });

    const session: ProgramSession = {
      id: crypto.randomUUID(),
      name: s.name,
      order: 0,
      kind: isCardio ? ("cardio" as const) : ("lifting" as const),
      notes: s.notes,
      exercises,
      cardio: isCardio ? (s as any).cardio : null,
    };

    return {
      id: crypto.randomUUID(),
      day: si + 1,
      sessions: [session],
    };
  });

  const stamped = stampWeeks(templateDays, plannedWeeks);
  const weeks = applyDefaultWeekdays(stamped, trainingDays);

  return { weeks, createdNames, unresolvable };
}

/** Replace `pending:<name>` ids with real ids once custom exercises are inserted. */
export function bindPendingExercises(
  weeks: ProgramWeek[],
  nameToId: Map<string, string>
): ProgramWeek[] {
  return weeks.map((w) => ({
    ...w,
    days: w.days.map((d) => ({
      ...d,
      sessions: d.sessions.map((s) => ({
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
    })),
  }));
}
