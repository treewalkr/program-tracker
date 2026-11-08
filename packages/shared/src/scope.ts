import type { AiProgramDraft, ChatProposal } from "./ai";
import { alignExercises, diffDrafts, unproposedChanges, type SlotChange } from "./slots";

// ---------------------------------------------------------------------------
// Proposal scoping: a Build applies exactly the approved changes (F04)
// ---------------------------------------------------------------------------

const RATIONALE_MAX = 4000;

/**
 * The `built` draft cut down to what `proposal` asked for, starting from
 * `parent`:
 * - proposed slot changes come from `built` (swap/rx take the built exercise,
 *   removed drops it, added inserts it after its aligned predecessor);
 * - a covered cardio change takes the built cardio prescription;
 * - everything else (other slots, session names/kinds/types, cardio,
 *   sessions the AI added or dropped, phasing) stays as in `parent`;
 * - name / rationale / clientSummary come from `built` (they explain the
 *   change), with one rationale line when something was discarded.
 * `discarded` lists the AI's changes outside the proposal, in diff order.
 */
export function scopeToProposal(
  parent: AiProgramDraft,
  built: AiProgramDraft,
  proposal: Pick<ChatProposal, "changes">
): { draft: AiProgramDraft; discarded: SlotChange[] } {
  const changes = diffDrafts(parent, built);
  const days = parent.sessions.length;
  const unproposed = new Set(unproposedChanges(changes, proposal));
  // Changes on sessions the parent doesn't have can't be applied to it.
  const discarded = changes.filter((c) => unproposed.has(c) || c.day > days);
  const proposed = changes.filter((c) => !discarded.includes(c));

  const draft = structuredClone(parent);
  draft.name = built.name;
  draft.clientSummary = built.clientSummary;
  draft.rationale = built.rationale;
  if (discarded.length) {
    const line = `\n\nThe AI also changed ${discarded.length} ${discarded.length === 1 ? "thing" : "things"} outside the proposal. Kept as before.`;
    draft.rationale = `${built.rationale.slice(0, RATIONALE_MAX - line.length)}${line}`;
  }

  draft.sessions = parent.sessions.map((ps, d) => {
    const day = d + 1;
    const bs = built.sessions[d];
    const session = structuredClone(ps);
    if (!bs) return session;
    const mine = proposed.filter((c) => c.day === day);
    if (mine.some((c) => c.kind === "cardio") && bs.cardio) session.cardio = structuredClone(bs.cardio);
    const takeBefore = new Set(mine.filter((c) => c.beforeSlot != null && c.kind !== "added").map((c) => c.beforeSlot! - 1));
    const takeAdded = new Set(mine.filter((c) => c.kind === "added").map((c) => c.afterSlot! - 1));
    const out: AiProgramDraft["sessions"][number]["exercises"] = [];
    for (const [i, j] of alignExercises(ps.exercises, bs.exercises)) {
      if (i != null && j != null) out.push(structuredClone(takeBefore.has(i) ? bs.exercises[j] : ps.exercises[i]));
      else if (i != null) {
        if (!takeBefore.has(i)) out.push(structuredClone(ps.exercises[i]));
      } else if (j != null && takeAdded.has(j)) out.push(structuredClone(bs.exercises[j]));
    }
    session.exercises = out;
    return session;
  });

  return { draft, discarded };
}

// ---------------------------------------------------------------------------
// Free-text revisions: phasing lock (plan §D)
// ---------------------------------------------------------------------------

/**
 * Words that put a revision message "about the block plan": plan / phase /
 * phasing, deload, periodisation (any spelling), mesocycle, taper, next block,
 * block length, and a numbered week ("week 4", "W4", "6 weeks"). Plain "block"
 * and "this week" are left out on purpose: "block pull" is an exercise and
 * "this week felt heavy" is about load, not the plan.
 */
const PLAN_WORDS =
  /\b(plan|phas(e|es|ing)|deload\w*|periodi[sz]\w*|mesocycle\w*|taper\w*|next block|block (length|plan)|weeks? ?\d+|w\d+|\d+ ?weeks?)\b/i;

/** True when a free-text revision message asks about the block plan (see PLAN_WORDS). */
export function mentionsPlan(message: string): boolean {
  return PLAN_WORDS.test(message);
}

/**
 * Free-text revision guard: keeps `parent`'s phasing on `revised` unless
 * `message` is about the plan. `discarded` lists the plan changes reverted.
 */
export function lockPhasing(
  parent: AiProgramDraft,
  revised: AiProgramDraft,
  message: string
): { draft: AiProgramDraft; discarded: SlotChange[] } {
  if (mentionsPlan(message)) return { draft: revised, discarded: [] };
  const discarded = diffDrafts({ sessions: [], phasing: parent.phasing }, { sessions: [], phasing: revised.phasing });
  if (!discarded.length) return { draft: revised, discarded };
  const draft = structuredClone(revised);
  if (parent.phasing) draft.phasing = structuredClone(parent.phasing);
  else delete draft.phasing;
  return { draft, discarded };
}
