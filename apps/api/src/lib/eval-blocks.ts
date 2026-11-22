import { blockIssues, hardSetCount, isPrep, mainWork, movementPrep, type AiProgramDraft } from "@pt/shared";

type DraftEx = AiProgramDraft["weeks"][number]["sessions"][number]["exercises"][number];

export interface BlockEval {
  /** Exercise sessions with movement prep / all exercise sessions. */
  withPrep: number;
  sessions: number;
  prepItems: number;
  /** Working sets on prep slots — never in any total. */
  prepSets: number;
  /** Sessions whose main work does not hold exactly one Primary. */
  primaryOff: string[];
  /** A Primary placed in prep (it should lead main work). */
  primaryInPrep: string[];
  /** Cap or ≥ 1 main broken (fixDraftRoles should have fixed these). */
  ruleBroken: string[];
  /** "W1 Lower: Hip CARs, Band pull-apart → Back Squat" for the human spot-check. */
  spotCheck: string[];
}

/**
 * Session-block checks on an AI draft (eval:block): prep never changes the set
 * totals, one Primary counted in main only, the caps hold. The spot-check
 * lines pair each session's prep with its first main lift, so a reader can
 * judge whether the prep fits that session.
 */
export function evalBlocks(draft: AiProgramDraft, nameOf: (e: DraftEx) => string = (e) => e.exerciseName ?? e.exerciseId ?? "?"): BlockEval {
  const out: BlockEval = { withPrep: 0, sessions: 0, prepItems: 0, prepSets: 0, primaryOff: [], primaryInPrep: [], ruleBroken: [], spotCheck: [] };
  for (const w of draft.weeks) {
    if (w.locked) continue;
    for (const s of w.sessions) {
      if (s.kind === "cardio") continue;
      const at = `W${w.week} ${s.name}`;
      out.sessions++;
      const prep = movementPrep(s.exercises);
      const main = mainWork(s.exercises);
      const primaries = main.filter((e) => e.role === "primary").length;
      if (primaries !== 1) out.primaryOff.push(`${at} (${primaries})`);
      if (prep.some((e) => e.role === "primary")) out.primaryInPrep.push(at);
      const broken = blockIssues(s.exercises.map((e) => ({ ...e, block: isPrep(e) ? "prep" : e.block })));
      if (broken.length) out.ruleBroken.push(`${at}: ${broken.join("; ")}`);
      if (prep.length === 0) continue;
      out.withPrep++;
      out.prepItems += prep.length;
      out.prepSets += prep.reduce((n, e) => n + hardSetCount(e.prescribedSets), 0);
      out.spotCheck.push(`${at}: ${prep.map(nameOf).join(", ")} → ${main[0] ? nameOf(main[0]) : "(no main)"}`);
    }
  }
  return out;
}

/** The report cell: "2/4 sessions · 7 items · 1 Primary off". */
export function blockEvalCell(b: BlockEval): string {
  const bad = [
    b.primaryOff.length ? `${b.primaryOff.length} Primary off` : "",
    b.primaryInPrep.length ? `${b.primaryInPrep.length} Primary in prep` : "",
    b.ruleBroken.length ? `${b.ruleBroken.length} RULE BROKEN` : "",
  ].filter(Boolean);
  return [`${b.withPrep}/${b.sessions} sessions`, `${b.prepItems} items`, ...bad].join(" · ");
}
