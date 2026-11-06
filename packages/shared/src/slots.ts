// ---------------------------------------------------------------------------
// Slot diff between two draft versions (chat page change lists)
// ---------------------------------------------------------------------------

/** Minimal set shape the slot diff reads (fits AiProgramDraft and web AiDraftDto). */
export interface SlotDiffSet {
  reps: number;
  amrap?: boolean;
  durationSeconds?: number | null;
  targetRpe?: number | null;
  restSeconds?: number | null;
}
export interface SlotDiffExercise {
  exerciseId?: string | null;
  exerciseName?: string | null;
  prescribedSets: SlotDiffSet[];
}
export interface SlotDiffDraft {
  sessions: { name: string; exercises: SlotDiffExercise[] }[];
}

export type SlotChangeKind = "swap" | "rx" | "added" | "removed";

export interface SlotChange {
  /** 1-based session index (same in both drafts). */
  day: number;
  /** 1-based exercise index in the BEFORE draft; null for "added". */
  beforeSlot: number | null;
  /** 1-based exercise index in the AFTER draft; null for "removed". */
  afterSlot: number | null;
  kind: SlotChangeKind;
  /** Exercise name after the change (before, for "removed"). */
  exercise: string;
  /** swap: old name · rx: old prescription parts · added: null · removed: old prescription. */
  from: string | null;
  /** swap: new name · rx: new prescription parts · added: new prescription · removed: null. */
  to: string | null;
}

const exKey = (e: SlotDiffExercise) => (e.exerciseId ?? e.exerciseName ?? "").toLowerCase();
const exName = (e: SlotDiffExercise) => e.exerciseName ?? e.exerciseId ?? "Unmapped exercise";

function range(values: number[], prefix: string, suffix: string): string | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? `${prefix}${lo}${suffix}` : `${prefix}${lo}–${hi}${suffix}`;
}

/**
 * Prescription split into comparable parts, e.g.
 * { volume: "5×5", rpe: "RPE 7–8", rest: "rest 180s" }.
 * volume: "<sets>×<reps|Ns>" when every set matches, else per-set joined by "/".
 */
export function rxParts(sets: SlotDiffSet[]): { volume: string; rpe: string | null; rest: string | null } {
  const each = sets.map((s) => (s.durationSeconds != null ? `${s.durationSeconds}s` : `${s.reps}${s.amrap ? "+" : ""}`));
  const volume = new Set(each).size === 1 ? `${sets.length}×${each[0]}` : each.join("/");
  const rpes = sets.map((s) => s.targetRpe).filter((v): v is number => v != null);
  const rests = sets.map((s) => s.restSeconds).filter((v): v is number => v != null);
  return {
    volume,
    rpe: range(rpes, "RPE ", ""),
    rest: range(rests, "rest ", "s"),
  };
}

/** "5×5 @RPE 7–8 · rest 180s" — one-line prescription label. */
export function rxLabel(sets: SlotDiffSet[]): string {
  const p = rxParts(sets);
  return `${p.volume}${p.rpe ? ` @${p.rpe}` : ""}${p.rest ? ` · ${p.rest}` : ""}`;
}

/** Only the parts that differ: ["rest 120s", "rest 150s"]; null when identical. */
function rxDelta(a: SlotDiffSet[], b: SlotDiffSet[]): [string, string] | null {
  const pa = rxParts(a);
  const pb = rxParts(b);
  const from: string[] = [];
  const to: string[] = [];
  for (const k of ["volume", "rpe", "rest"] as const) {
    if (pa[k] !== pb[k]) {
      from.push(pa[k] ?? `no ${k}`);
      to.push(pb[k] ?? `no ${k}`);
    }
  }
  return from.length ? [from.join(", "), to.join(", ")] : null;
}

/** Longest-common-subsequence pairs of equal keys: [beforeIndex, afterIndex][]. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * Slot-by-slot changes from `before` to `after`, per session, in after-order.
 * Exercises are aligned by catalog id (else name) with an LCS; between two
 * aligned anchors, unmatched before/after exercises pair up in order as
 * "swap", leftovers are "removed" / "added". Aligned exercises whose sets,
 * RPE or rest differ are "rx". Sessions only in `after` are all "added";
 * sessions only in `before` are all "removed".
 */
export function diffDraftSlots(before: SlotDiffDraft, after: SlotDiffDraft): SlotChange[] {
  const out: SlotChange[] = [];
  const days = Math.max(before.sessions.length, after.sessions.length);
  for (let d = 0; d < days; d++) {
    const A = before.sessions[d]?.exercises ?? [];
    const B = after.sessions[d]?.exercises ?? [];
    const pairs = lcsPairs(A.map(exKey), B.map(exKey));
    const anchors: [number, number][] = [[-1, -1], ...pairs, [A.length, B.length]];
    for (let k = 0; k < anchors.length - 1; k++) {
      const [a0, b0] = anchors[k];
      const [a1, b1] = anchors[k + 1];
      const gapA: number[] = [];
      const gapB: number[] = [];
      for (let i = a0 + 1; i < a1; i++) gapA.push(i);
      for (let j = b0 + 1; j < b1; j++) gapB.push(j);
      const n = Math.min(gapA.length, gapB.length);
      for (let x = 0; x < n; x++) {
        const ea = A[gapA[x]];
        const eb = B[gapB[x]];
        out.push({ day: d + 1, beforeSlot: gapA[x] + 1, afterSlot: gapB[x] + 1, kind: "swap", exercise: exName(eb), from: exName(ea), to: exName(eb) });
      }
      for (let x = n; x < gapA.length; x++) {
        const ea = A[gapA[x]];
        out.push({ day: d + 1, beforeSlot: gapA[x] + 1, afterSlot: null, kind: "removed", exercise: exName(ea), from: rxLabel(ea.prescribedSets), to: null });
      }
      for (let x = n; x < gapB.length; x++) {
        const eb = B[gapB[x]];
        out.push({ day: d + 1, beforeSlot: null, afterSlot: gapB[x] + 1, kind: "added", exercise: exName(eb), from: null, to: rxLabel(eb.prescribedSets) });
      }
      if (k < pairs.length) {
        const [i, j] = pairs[k];
        const delta = rxDelta(A[i].prescribedSets, B[j].prescribedSets);
        const nameChanged = exName(A[i]) !== exName(B[j]);
        if (nameChanged) out.push({ day: d + 1, beforeSlot: i + 1, afterSlot: j + 1, kind: "swap", exercise: exName(B[j]), from: exName(A[i]), to: exName(B[j]) });
        if (delta) out.push({ day: d + 1, beforeSlot: i + 1, afterSlot: j + 1, kind: "rx", exercise: exName(B[j]), from: delta[0], to: delta[1] });
      }
    }
  }
  return out;
}

/** Minimal proposal shape for matching (see ChatProposal in ai.ts). */
export interface ProposalChangeRef {
  day: number;
  slot: number | null;
  kind: "swap" | "edit" | "add" | "remove";
}

/**
 * Changes the proposal did not ask for. A proposal change at (day, slot)
 * covers every swap/rx/removed change at that day + beforeSlot; each "add"
 * covers one "added" change on its day.
 */
export function unproposedChanges(changes: SlotChange[], proposal: { changes: ProposalChangeRef[] }): SlotChange[] {
  const covered = new Set(
    proposal.changes.filter((p) => p.slot != null).map((p) => `${p.day}:${p.slot}`)
  );
  const addsLeft = new Map<number, number>();
  for (const p of proposal.changes) if (p.kind === "add") addsLeft.set(p.day, (addsLeft.get(p.day) ?? 0) + 1);
  return changes.filter((c) => {
    if (c.kind === "added") {
      const left = addsLeft.get(c.day) ?? 0;
      if (left > 0) {
        addsLeft.set(c.day, left - 1);
        return false;
      }
      return true;
    }
    return !covered.has(`${c.day}:${c.beforeSlot}`);
  });
}
