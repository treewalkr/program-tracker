import { sessionFlags, type ExerciseFlags } from "./logFlags";
import { isSwapped, rowsToSave, type SheetRow } from "./logSheet";
import type { ClientStrip } from "./overview";

// ---------------------------------------------------------------------------
// After a save: what went in, and who's next
// ---------------------------------------------------------------------------

/** What a lifting save held — read off the sheet as it was sent. */
export interface SaveRecap {
  sets: number;
  /** Exercises with at least one logged set. */
  exercises: number;
  /** Exercise ids skipped whole, in sheet order. */
  skipped: string[];
  /** Exercise ids flagged for pain or technique, in sheet order. */
  pain: string[];
  technique: string[];
  /** Exercise ids logged under a swap. */
  swapped: string[];
}

export function saveRecap(rows: SheetRow[], flags: ExerciseFlags): SaveRecap {
  const sent = rowsToSave(rows);
  const recap: SaveRecap = {
    sets: sent.length,
    exercises: new Set(sent.map((r) => r.programExerciseId)).size,
    skipped: [],
    pain: [],
    technique: [],
    swapped: [],
  };
  const add = (list: string[], id: string) => {
    if (!list.includes(id)) list.push(id);
  };
  for (const f of sessionFlags(rows, flags)) {
    if (f.kind === "skipped") add(recap.skipped, f.exerciseId);
    else add(recap[f.kind], f.exerciseId);
  }
  for (const r of sent) if (isSwapped(r)) add(recap.swapped, r.exerciseId);
  return recap;
}

export interface RecapNote {
  tone: "bad" | "warn" | "muted";
  text: string;
}

/** "Bench, Row" · "Bench, Row and 2 more" — a recap line never grows past a glance. */
export function nameList(names: string[], max = 2): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** The recap's second line: pain first (it needs a follow-up), then technique, skips and swaps. */
export function recapNotes(r: SaveRecap, nameOf: (exerciseId: string) => string): RecapNote[] {
  const names = (ids: string[]) => nameList(ids.map(nameOf));
  const out: RecapNote[] = [];
  if (r.pain.length) out.push({ tone: "bad", text: `Pain · ${names(r.pain)}` });
  if (r.technique.length) out.push({ tone: "warn", text: `Technique · ${names(r.technique)}` });
  if (r.skipped.length) out.push({ tone: "muted", text: `Skipped ${names(r.skipped)}` });
  if (r.swapped.length) out.push({ tone: "muted", text: `Swapped in ${names(r.swapped)}` });
  return out;
}

/** "14 sets · 5 exercises" */
export function recapCounts(r: Pick<SaveRecap, "sets" | "exercises">): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  return `${n(r.sets, "set")} · ${n(r.exercises, "exercise")}`;
}

/** The next client with a session planned today and not logged yet. */
export interface NextClient {
  clientId: string;
  name: string;
  /** The session waiting today: "Lower B". */
  session: string;
  /** The logger, opened on that session and today. */
  href: string;
}

/**
 * Who to log next: the first client after this one in roster order (wrapping
 * round) whose today still has a planned session not logged. Only today —
 * catching up on missed days is the overview's job. Null when everyone's done.
 */
export function nextToLog(strips: ClientStrip[], currentId: string, today: string): NextClient | null {
  const at = strips.findIndex((s) => s.client.id === currentId);
  const order = at < 0 ? strips : [...strips.slice(at + 1), ...strips.slice(0, at)];
  for (const s of order) {
    if (s.client.id === currentId || s.client.status !== "active") continue;
    const day = s.weeks.flat().find((d) => d.date === today);
    const open = day?.sessions.find((x) => x.planned && x.status === "today");
    if (!day || !open) continue;
    const sessionId = day.openSessionId ?? open.id;
    const href = sessionId
      ? `/clients/${s.client.id}/log?session=${encodeURIComponent(sessionId)}&date=${today}`
      : `/clients/${s.client.id}/log`;
    return { clientId: s.client.id, name: s.client.name, session: open.name, href };
  }
  return null;
}
