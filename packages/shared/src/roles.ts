import {
  EXERCISE_ROLES,
  EXERCISE_ROLE_INFO,
  customRoleKey,
  type BuiltinRole,
  type Equipment,
  type ExerciseRole,
  type MovementPattern,
  type MuscleGroup,
  type RoleCategory,
} from "./domain";

// ---------------------------------------------------------------------------
// Role labels — built-ins merged with the trainer's own (docs/role-labels-plan.md)
// ---------------------------------------------------------------------------

export const ROLE_LABEL_NAME_MAX = 40;
export const ROLE_LABEL_CHIP_MAX = 12;
export const ROLE_LABEL_DESCRIPTION_MAX = 200;

/** One entry of a trainer's label list: a built-in (overrides applied) or their own. */
export interface RoleLabel {
  /** The value stored on a program exercise: a built-in key or `label:<uuid>`. */
  key: ExerciseRole;
  /** Built-in key, or null for the trainer's own label. */
  builtinKey: BuiltinRole | null;
  /** The trainer's own label's row id; null for built-ins. */
  id: string | null;
  name: string;
  chip: string;
  description: string;
  /** Built-ins only; the trainer's own labels show under "Your labels". */
  category: RoleCategory | null;
  rank: number;
  archived: boolean;
}

/** A `role_labels` row as the merge needs it (db rows and mock rows both fit). */
export interface RoleLabelRowLike {
  id: string;
  builtinKey: string | null;
  name: string;
  chip: string | null;
  description: string | null;
  rank: number;
  archivedAt: Date | string | null;
}

/** The six built-ins with their defaults, in order. */
export const BUILTIN_ROLE_LABELS: readonly RoleLabel[] = EXERCISE_ROLES.map((r) => ({
  key: r,
  builtinKey: r,
  id: null,
  name: EXERCISE_ROLE_INFO[r].name,
  chip: EXERCISE_ROLE_INFO[r].chip,
  description: EXERCISE_ROLE_INFO[r].description,
  category: EXERCISE_ROLE_INFO[r].category,
  rank: EXERCISE_ROLE_INFO[r].rank,
  archived: false,
}));

/**
 * Built-ins (a row with builtinKey overrides chip/description/rank; key and
 * name stay fixed) + the trainer's own labels, sorted by rank. Archived
 * labels are kept, flagged — programs still render them.
 */
export function mergeRoleLabels(rows: readonly RoleLabelRowLike[]): RoleLabel[] {
  const overrides = new Map(rows.filter((r) => r.builtinKey).map((r) => [r.builtinKey as string, r]));
  const builtins = BUILTIN_ROLE_LABELS.map((b): RoleLabel => {
    const o = overrides.get(b.key);
    if (!o) return { ...b };
    return {
      ...b,
      chip: o.chip?.trim() || b.chip,
      description: o.description?.trim() || b.description,
      rank: o.rank,
    };
  });
  const own = rows
    .filter((r) => !r.builtinKey)
    .map(
      (r): RoleLabel => ({
        key: customRoleKey(r.id),
        builtinKey: null,
        id: r.id,
        name: r.name,
        chip: r.chip?.trim() || r.name,
        description: r.description ?? "",
        category: null,
        rank: r.rank,
        archived: r.archivedAt !== null,
      })
    );
  return [...builtins, ...own].sort((a, b) => a.rank - b.rank);
}

/** The label a stored role points at, or null (unknown / not loaded). */
export function resolveRole(role: string | null | undefined, labels: readonly RoleLabel[] = BUILTIN_ROLE_LABELS): RoleLabel | null {
  if (!role) return null;
  return labels.find((l) => l.key === role) ?? null;
}

/** True when the role is a built-in or one of the trainer's (non-archived) labels. */
export function isKnownRole(role: string | null | undefined, labels: readonly RoleLabel[] = BUILTIN_ROLE_LABELS): boolean {
  const l = resolveRole(role, labels);
  return l !== null && !l.archived;
}

/**
 * Rank for a new label sorting right after `after` (a label key) — halfway to
 * the next active label, or 100 past the last. No `after` (or unknown) → last.
 */
export function rankAfter(labels: readonly RoleLabel[], after?: string | null): number {
  const active = labels.filter((l) => !l.archived).sort((a, b) => a.rank - b.rank);
  if (active.length === 0) return 100;
  const i = after ? active.findIndex((l) => l.key === after) : -1;
  if (i === -1 || i === active.length - 1) return active[active.length - 1].rank + 100;
  return (active[i].rank + active[i + 1].rank) / 2;
}

// ---------------------------------------------------------------------------
// Auto-select — a built-in label from what the exercise is and where it sits
// ---------------------------------------------------------------------------

/** What suggestRole looks at; catalog fields when known, the name otherwise. */
export interface RoleHints {
  name: string;
  movementPattern?: MovementPattern | null;
  primaryMuscleGroup?: MuscleGroup | null;
  equipment?: Equipment | null;
  prescribedSets?: readonly { reps?: number | null; repsMin?: number | null; amrap?: boolean | null; type?: string | null }[];
}

const EXPLOSIVE = /\b(jumps?|jumping|throws?|cleans?|snatch(es)?|jerks?|plyo\w*|med(icine)?[\s-]?ball|bounds?|bounding|sprints?|sprinting)\b/i;
const TRUNK_PATTERNS = new Set<MovementPattern>([
  "anti_rotation",
  "anti_lateral_flexion",
  "anti_trunk_flexion",
  "anti_extension",
  "carry",
  "trunk_flexion",
  "lateral_flexion",
  "rotation",
]);
const TRUNK_NAME =
  /\b(planks?|crunch(es)?|sit[\s-]?ups?|pallof|dead[\s-]?bugs?|roll[\s-]?outs?|ab[\s-]?wheel|carry|carries|farmers?'?|suitcase|leg raises?|knee raises?|hollow|side bends?|russian twists?|wood[\s-]?chops?|chops?|bird[\s-]?dogs?|copenhagen|v[\s-]?ups?|abs?)\b/i;
const COMPOUND_PATTERNS = new Set<MovementPattern>([
  "vertical_push",
  "vertical_pull",
  "horizontal_push",
  "horizontal_pull",
  "knee_dominant",
  "hip_dominant",
]);
const ISOLATION_NAME =
  /\b(curls?|raises?|extensions?|fly|flyes|flies|kick[\s-]?backs?|shrugs?|calf|calves|push[\s-]?downs?|pull[\s-]?overs?|face[\s-]?pulls?|adduct\w*|abduct\w*|pec[\s-]?deck)\b/i;
const COMPOUND_NAME =
  /\b(squats?|deadlifts?|dl|rdl|bench|press(es)?|rows?|pull[\s-]?ups?|chin[\s-]?ups?|pull[\s-]?downs?|lunges?|split squats?|step[\s-]?ups?|hip thrusts?|thrusts?|good[\s-]?mornings?|dips?|push[\s-]?ups?|hinges?)\b/i;

type Kind = "power" | "core" | "compound" | "accessory";

function kindOf(e: RoleHints): Kind {
  if (EXPLOSIVE.test(e.name)) return "power";
  if (e.movementPattern && TRUNK_PATTERNS.has(e.movementPattern)) return "core";
  if (e.primaryMuscleGroup === "core" || e.primaryMuscleGroup === "obliques") return "core";
  if (!e.movementPattern && TRUNK_NAME.test(e.name)) return "core";
  if (e.movementPattern) return COMPOUND_PATTERNS.has(e.movementPattern) ? "compound" : "accessory";
  if (ISOLATION_NAME.test(e.name)) return "accessory";
  return COMPOUND_NAME.test(e.name) ? "compound" : "accessory";
}

/**
 * Heavy = working sets at ≤ 6 reps (a range counts by its low end); unknown
 * reps count as heavy. All-AMRAP work ("to failure") is not heavy.
 */
function isHeavy(e: RoleHints): boolean {
  const working = (e.prescribedSets ?? []).filter((s) => (s.type ?? "working") === "working");
  if (working.length > 0 && working.every((s) => s.amrap)) return false;
  const reps = working
    .filter((s) => !s.amrap && typeof s.reps === "number" && s.reps > 0)
    .map((s) => s.repsMin ?? (s.reps as number));
  return reps.length === 0 || Math.min(...reps) <= 6;
}

/**
 * Built-in label for `sessionExercises[index]` (`exercise`): explosive →
 * power; trunk → core; the session's first heavy compound (≤ 6 reps when
 * known, not to failure) → primary, the next → secondary; other compound work → strength;
 * everything else → accessory (Auxiliary). Pure; never a custom label.
 */
export function suggestRole(exercise: RoleHints, sessionExercises: readonly RoleHints[], index: number): BuiltinRole {
  const kind = kindOf(exercise);
  if (kind === "power" || kind === "core") return kind;
  if (kind === "accessory") return "accessory";
  if (!isHeavy(exercise)) return "strength";
  const heavyBefore = sessionExercises
    .slice(0, Math.max(0, index))
    .filter((e) => kindOf(e) === "compound" && isHeavy(e)).length;
  return heavyBefore === 0 ? "primary" : heavyBefore === 1 ? "secondary" : "strength";
}

/** suggestRole for every exercise of a session, in order. */
export const suggestRoles = (session: readonly RoleHints[]): BuiltinRole[] =>
  session.map((e, i) => suggestRole(e, session, i));


// ---------------------------------------------------------------------------
// Draft checks — every AI draft exercise ends with a known label
// ---------------------------------------------------------------------------

interface DraftSessionLike {
  name: string;
  kind?: string;
  exercises?: {
    exerciseId?: string;
    exerciseName?: string;
    role?: ExerciseRole;
    prescribedSets: readonly { reps?: number | null; repsMin?: number | null; amrap?: boolean | null; type?: string | null }[];
  }[];
}

interface DraftLike {
  rationale: string;
  weeks: { sessions: DraftSessionLike[] }[];
}

/**
 * A missing or unknown (or archived) label → suggestRole; a lifting session
 * with more than one Primary keeps them, with an info note for the trainer
 * (once per session name, however many weeks repeat it).
 * `hintsFor` supplies catalog fields (pattern, muscle, equipment) by id.
 */
export function fixDraftRoles<D extends DraftLike>(
  draft: D,
  labels: readonly RoleLabel[],
  hintsFor: (exerciseId: string | undefined) => Omit<RoleHints, "name" | "prescribedSets"> | undefined = () => undefined
): { draft: D; notes: string[]; filled: number } {
  const notes = new Set<string>();
  let filled = 0;
  const fixSession = <S extends DraftSessionLike>(s: S): S => {
    if (!s.exercises?.length) return s;
    const hints: RoleHints[] = s.exercises.map((e) => ({
      ...hintsFor(e.exerciseId),
      name: e.exerciseName ?? "",
      prescribedSets: e.prescribedSets,
    }));
    const exercises = s.exercises.map((e, i) => {
      if (isKnownRole(e.role, labels)) return e;
      filled++;
      return { ...e, role: suggestRole(hints[i], hints, i) };
    });
    if (exercises.filter((e) => e.role === "primary").length > 1) {
      notes.add(`${s.name} has more than one Primary lift — usually one leads the session.`);
    }
    return { ...s, exercises };
  };
  const weeks = draft.weeks.map((w) => ({ ...w, sessions: w.sessions.map(fixSession) }));
  return { draft: { ...draft, weeks }, notes: [...notes], filled };
}
