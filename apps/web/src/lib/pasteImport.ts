import {
  blockLabel,
  defaultCardio,
  liftingNames,
  templateWeekIndex,
  type ImportFlag,
  type ImportMatch,
  type ImportResult,
  type ReviewExercise,
  type ReviewSession,
  type ReviewWeek,
} from "@pt/shared";
import type { DraftForm, SessionRow } from "./programForm";
import { fmtSet } from "./format";
import { suggestRoleIn } from "./roleLabels";

/**
 * Paste notes review (docs/paste-import-plan.md §5): pure helpers between a
 * stored ImportResult and the new-program form. Keys address items in the
 * result: "w1" week, "w1d0" day, "w1d0s0" session, "w1d0s0e3" exercise.
 */

export const weekKey = (w: number) => `w${w}`;
export const dayKey = (w: number, d: number) => `w${w}d${d}`;
export const sessionKey = (w: number, d: number, s: number) => `w${w}d${d}s${s}`;
export const exerciseKey = (w: number, d: number, s: number, e: number) => `w${w}d${d}s${s}e${e}`;

// —— blocks ————————————————————————————————————————————————————————————

/** False when the read found no session at all (not a program) — there is nothing to review. */
export const hasTraining = (r: ImportResult): boolean => r.weeks.some((w) => w.days.some((d) => d.sessions.length > 0));

/** Moved to @pt/shared (history import names its programs with them); re-exported for the review. */
export { blockLabel, templateWeekIndex };

// —— exercise matches ————————————————————————————————————————————————————

export type MatchChoice =
  | { kind: "catalog"; exerciseId: string; exerciseName: string }
  | { kind: "new"; exerciseName: string };

export interface ChoiceState {
  choice: MatchChoice;
  /** The trainer picked it — saved as a personal alias on "Use this". */
  confirmed: boolean;
}

export function defaultChoice(m: ImportMatch | undefined, fallbackName: string): MatchChoice {
  if (m && m.kind !== "new" && m.exerciseId) return { kind: "catalog", exerciseId: m.exerciseId, exerciseName: m.exerciseName };
  return { kind: "new", exerciseName: m?.exerciseName || fallbackName };
}

/** The current choice for an exercise: the trainer's, else what the match proposed. */
export const choiceFor = (choices: Record<string, ChoiceState>, key: string, ex: ReviewExercise): MatchChoice =>
  choices[key]?.choice ?? defaultChoice(ex.match, ex.name);

/** Every exercise of the block's template week, with its key. */
export function templateExercises(r: ImportResult, block: number): { key: string; ex: ReviewExercise }[] {
  const w = templateWeekIndex(r, block);
  return (r.weeks[w]?.days ?? []).flatMap((d, di) =>
    d.sessions.flatMap((s, si) => s.exercises.map((ex, ei) => ({ key: exerciseKey(w, di, si, ei), ex }))),
  );
}

/** Custom exercises "Use this" has to create first (unique, case-insensitive). */
export function newExerciseNames(r: ImportResult, block: number, choices: Record<string, ChoiceState>): string[] {
  const seen = new Map<string, string>();
  for (const { key, ex } of templateExercises(r, block)) {
    const c = choiceFor(choices, key, ex);
    if (c.kind === "new" && c.exerciseName.trim()) seen.set(c.exerciseName.trim().toLowerCase(), c.exerciseName.trim());
  }
  return [...seen.values()];
}

/**
 * Personal aliases to save, as written → exercise: the trainer's picks, and
 * the fuzzy matches they let stand (accepted by default) — next time they're exact.
 */
export function aliasesToSave(
  r: ImportResult,
  block: number,
  choices: Record<string, ChoiceState>,
  createdIds: Map<string, string> = new Map(),
): { alias: string; exerciseId: string; source: "import" }[] {
  const out = new Map<string, { alias: string; exerciseId: string; source: "import" }>();
  for (const { key, ex } of templateExercises(r, block)) {
    const state = choices[key];
    const picked = state?.confirmed ? state.choice : ex.match?.kind === "fuzzy" ? choiceFor(choices, key, ex) : null;
    if (!picked) continue;
    const id = picked.kind === "catalog" ? picked.exerciseId : createdIds.get(picked.exerciseName.trim().toLowerCase());
    if (id) out.set(ex.sourceName.trim().toLowerCase(), { alias: ex.sourceName.trim(), exerciseId: id, source: "import" });
  }
  return [...out.values()];
}

// —— result → form ——————————————————————————————————————————————————————

/**
 * The block's template week as the new-program form: one row per session in
 * order, named after the day labels, sets as mapped, notes kept. `resolve`
 * turns an exercise's choice into a catalog id (created ones included).
 */
export function formFromImport(
  r: ImportResult,
  block: number,
  base: DraftForm,
  opts: {
    choices: Record<string, ChoiceState>;
    resolve: (choice: MatchChoice) => { exerciseId: string; exerciseName: string };
    newKey: () => string;
    /** Catalog fields for the suggested roles (pattern, muscle); names alone otherwise. */
    catalog?: Parameters<typeof suggestRoleIn>[2];
  },
): DraftForm {
  const wi = templateWeekIndex(r, block);
  const week = r.weeks[wi];
  const sessions: SessionRow[] = (week?.days ?? []).flatMap((d, di) =>
    d.sessions.map((s, si): SessionRow => {
      if (s.kind === "cardio") {
        return {
          key: opts.newKey(),
          name: s.name.slice(0, 60),
          kind: "cardio",
          cardio: { ...defaultCardio(), ...structuredClone(s.cardio ?? { modality: s.name }) },
          exercises: [],
        };
      }
      const rows = s.exercises.map((ex, ei) => {
        const { exerciseId, exerciseName } = opts.resolve(choiceFor(opts.choices, exerciseKey(wi, di, si, ei), ex));
        return {
          id: opts.newKey(),
          exerciseId,
          exerciseName,
          order: ei,
          prescribedSets: structuredClone(ex.sets),
          ...(ex.note ? { notes: ex.note } : {}),
        };
      });
      // every imported exercise gets a suggested role; the trainer can change it
      return {
        key: opts.newKey(),
        name: s.name.slice(0, 60),
        kind: "lifting",
        cardio: defaultCardio(),
        exercises: rows.map((row, i) => ({ ...row, role: suggestRoleIn(rows, i, opts.catalog ?? []) })),
      };
    }),
  );
  const weeksInBlock = r.blocks[block]?.weeks.length ?? 1;
  return {
    ...structuredClone(base),
    name: (liftingNames(week).join(" / ") || base.name).slice(0, 120),
    plannedWeeks: weeksInBlock > 1 ? weeksInBlock : base.plannedWeeks,
    sessions,
  };
}

// —— flags and lines ————————————————————————————————————————————————————

export interface FlagSummary {
  /** Amber items in the block's template week. */
  amber: number;
  info: number;
  /** What stops "Use this" (program limits). */
  blocking: string[];
  /** Fuzzy matches accepted by default — the trainer hasn't picked another. */
  matched: number;
  /** Lines in the whole paste nothing used. */
  unused: number;
  /** Lines in chunks that couldn't be read. */
  unread: number;
}

const flagsOfWeek = (w: ReviewWeek | undefined): ImportFlag[] =>
  !w
    ? []
    : [
        ...w.flags,
        ...w.days.flatMap((d) => [
          ...d.flags,
          ...d.sessions.flatMap((s: ReviewSession) => [...s.flags, ...s.exercises.flatMap((e) => e.flags)]),
        ]),
      ];

export function flagSummary(r: ImportResult, block: number, choices: Record<string, ChoiceState> = {}): FlagSummary {
  const flags = flagsOfWeek(r.weeks[templateWeekIndex(r, block)]);
  // a session cap counts once per session, wherever it was raised
  const totalSessions = (r.weeks[templateWeekIndex(r, block)]?.days ?? []).reduce((n, d) => n + d.sessions.length, 0);
  const blocking = flags.filter((f) => f.blocking).map((f) => f.message);
  if (totalSessions > 14) blocking.push(`${totalSessions} sessions — more than the 14 a week can hold`);
  return {
    amber: flags.filter((f) => f.level === "warn").length,
    info: flags.filter((f) => f.level === "info").length,
    blocking,
    matched: templateExercises(r, block).filter(({ key, ex }) => ex.match?.kind === "fuzzy" && !choices[key]?.confirmed).length,
    unused: r.unused.length,
    unread: r.unread.reduce((n, u) => n + (u.to - u.from + 1), 0),
  };
}

export type LineState = "blank" | "used" | "flagged" | "info" | "skipped" | "unused" | "unread";

/** line number → the keys of the items read from it. */
export function itemsByLine(r: ImportResult): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const add = (line: number | null, key: string) => {
    if (line === null) return;
    map.set(line, [...(map.get(line) ?? []), key]);
  };
  r.weeks.forEach((w, wi) => {
    add(w.line, weekKey(wi));
    w.days.forEach((d, di) => {
      add(d.line, dayKey(wi, di));
      d.sessions.forEach((s, si) => {
        add(s.line, sessionKey(wi, di, si));
        s.exercises.forEach((e, ei) => add(e.line, exerciseKey(wi, di, si, ei)));
      });
    });
  });
  return map;
}

/** item key → its source line. */
export function lineOfItem(r: ImportResult): Map<string, number> {
  const out = new Map<string, number>();
  for (const [line, keys] of itemsByLine(r)) for (const k of keys) if (!out.has(k)) out.set(k, line);
  return out;
}

/** How each line of the paste (index = line − 1) reads in the left pane. */
export function lineStates(r: ImportResult, lines: string[]): LineState[] {
  const flagged = new Map<number, "warn" | "info">();
  const mark = (line: number, flags: ImportFlag[]) => {
    if (flags.some((f) => f.level === "warn")) flagged.set(line, "warn");
    else if (flags.length && !flagged.has(line)) flagged.set(line, "info");
  };
  for (const w of r.weeks) {
    if (w.line !== null) mark(w.line, w.flags);
    for (const d of w.days) {
      mark(d.line, d.flags);
      for (const s of d.sessions) {
        mark(s.line, s.flags);
        for (const e of s.exercises) mark(e.line, e.flags);
      }
    }
  }
  const used = itemsByLine(r);
  const skipped = new Set(r.skipped.map((s) => s.line));
  const unused = new Set(r.unused);
  return lines.map((text, i): LineState => {
    const n = i + 1;
    if (r.unread.some((u) => n >= u.from && n <= u.to) && /[\p{L}\p{N}]/u.test(text)) return "unread";
    if (!/[\p{L}\p{N}]/u.test(text)) return "blank";
    if (unused.has(n)) return "unused";
    const f = flagged.get(n);
    if (f === "warn") return "flagged";
    if (used.has(n)) return f === "info" ? "info" : "used";
    if (skipped.has(n)) return "skipped";
    return "used";
  });
}

// —— formatting ————————————————————————————————————————————————————————

/** Sets as the editor reads them: "3 × 6–10", "10/8/6/5", "2 × 15s", "3 × AMRAP". */
export function setsLabel(sets: ReviewExercise["sets"]): string {
  if (sets.length === 0) return "—";
  const labels = sets.map((s) => fmtSet(s));
  return labels.every((l) => l === labels[0]) ? `${sets.length} × ${labels[0]}` : labels.join("/");
}

/** Cardio as one line: "Run · zone 2 · 10 km". */
export function cardioLabel(c: ReviewSession["cardio"]): string {
  if (!c) return "";
  return [
    c.modality,
    c.durationMin ? `${c.durationMin} min` : null,
    c.hrZone ? `zone ${c.hrZone}` : null,
    c.distanceKm ? `${c.distanceKm} km` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
