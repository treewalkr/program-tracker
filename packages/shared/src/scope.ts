import type { AiProgramDraft, ChatProposal } from "./ai";
import { alignExercises, diffDrafts, mergeWeekChanges, unproposedChanges, type SlotChange } from "./slots";

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
  const tagged = parent.weeks.length > 1 || built.weeks.length > 1;
  const weekOf = (c: SlotChange) => (tagged ? c.week : parent.weeks[0].week);
  const unproposed = new Set(unproposedChanges(changes, proposal, parent.weeks));
  // Changes on weeks or sessions the parent doesn't have can't be applied to it.
  const daysIn = new Map(parent.weeks.map((w) => [w.week, w.sessions.length]));
  const discarded = changes.filter((c) => unproposed.has(c) || c.day > (daysIn.get(weekOf(c) ?? -1) ?? 0));
  const proposed = changes.filter((c) => !discarded.includes(c));

  const draft = structuredClone(parent);
  draft.name = built.name;
  draft.clientSummary = built.clientSummary;
  draft.rationale = built.rationale;
  // The same change in several weeks counts once.
  const n = mergeWeekChanges(discarded).length;
  if (n) {
    const line = `\n\nThe AI also changed ${n} ${n === 1 ? "thing" : "things"} outside the proposal. Kept as before.`;
    draft.rationale = `${built.rationale.slice(0, RATIONALE_MAX - line.length)}${line}`;
  }

  draft.weeks = parent.weeks.map((pw) => {
    const bw = built.weeks.find((w) => w.week === pw.week);
    const week = structuredClone(pw);
    if (!bw) return week;
    const inWeek = proposed.filter((c) => weekOf(c) === pw.week);
    week.sessions = pw.sessions.map((ps, d) => scopeSession(ps, bw.sessions[d], inWeek.filter((c) => c.day === d + 1)));
    return week;
  });

  return { draft, discarded };
}

type Session = AiProgramDraft["weeks"][number]["sessions"][number];

/** One parent session with only the proposed changes (`mine`) taken from the built one. */
function scopeSession(ps: Session, bs: Session | undefined, mine: SlotChange[]): Session {
  const session = structuredClone(ps);
  if (!bs) return session;
  if (mine.some((c) => c.kind === "cardio") && bs.cardio) session.cardio = structuredClone(bs.cardio);
  const takeBefore = new Set(mine.filter((c) => c.beforeSlot != null && c.kind !== "added").map((c) => c.beforeSlot! - 1));
  const takeAdded = new Set(mine.filter((c) => c.kind === "added").map((c) => c.afterSlot! - 1));
  const out: Session["exercises"] = [];
  const added = new Set<(typeof out)[number]>();
  for (const [i, j] of alignExercises(ps.exercises, bs.exercises)) {
    if (i != null && j != null) out.push(structuredClone(takeBefore.has(i) ? bs.exercises[j] : ps.exercises[i]));
    else if (i != null) {
      if (!takeBefore.has(i)) out.push(structuredClone(ps.exercises[i]));
    } else if (j != null && takeAdded.has(j)) {
      const e = structuredClone(bs.exercises[j]);
      added.add(e);
      out.push(e);
    }
  }
  session.exercises = outsideGroups(out, added);
  return session;
}

/**
 * An added exercise the AI slotted between two members of one superset would
 * split the group in two; it moves to just after the group instead. An add
 * that carries the group's own letter joined the group and stays put.
 */
function outsideGroups<T extends { group?: string | null }>(list: T[], added: ReadonlySet<T>): T[] {
  const out = [...list];
  // Bubble each add past the group members that follow it, until none is inside a group.
  for (let moved = true; moved; ) {
    moved = false;
    for (let i = 0; i < out.length - 1; i++) {
      const e = out[i];
      if (!added.has(e)) continue;
      let k = i - 1;
      while (k >= 0 && added.has(out[k])) k--;
      const g = k >= 0 ? out[k].group : null;
      if (g && e.group !== g && out[i + 1].group === g) {
        [out[i], out[i + 1]] = [out[i + 1], e];
        moved = true;
      }
    }
  }
  return out;
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
  const discarded = diffDrafts({ weeks: [], phasing: parent.phasing }, { weeks: [], phasing: revised.phasing });
  if (!discarded.length) return { draft: revised, discarded };
  const draft = structuredClone(revised);
  if (parent.phasing) draft.phasing = structuredClone(parent.phasing);
  else delete draft.phasing;
  return { draft, discarded };
}
