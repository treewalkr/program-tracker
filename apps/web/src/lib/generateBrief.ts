/**
 * The Generate form's typed brief and the rules turned on, kept per client in
 * sessionStorage so a detour (e.g. "Manage templates →") and Back don't lose
 * them. Session, not local: a brief can hold health notes, so it dies with the tab.
 */
import { clearDraft, readDraft, writeDraft } from "./localDraft";

export interface GenerateBrief {
  instructions: string;
  /** Template ids, built-in (`builtin:<key>`) or the trainer's own. */
  selected: string[];
  /** The ?note/?tpl handoff the brief started from ("" for none), so a new handoff isn't masked by an old brief. */
  handoff?: string;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const session = (): Store | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

export function generateBriefKey(clientId: string): string {
  return `pt.generateBrief.${clientId}`;
}

/** The stored brief, or null. A corrupt or mis-shaped entry is removed. */
export function readGenerateBrief(key: string, s: Store | null = session()): GenerateBrief | null {
  if (!s) return null;
  let raw: string | null = null;
  try {
    raw = s.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  const d = readDraft<Partial<GenerateBrief>>(key, s)?.data;
  if (d && typeof d.instructions === "string" && Array.isArray(d.selected) && d.selected.every((x) => typeof x === "string")) {
    return { instructions: d.instructions, selected: d.selected, handoff: typeof d.handoff === "string" ? d.handoff : "" };
  }
  clearDraft(key, s);
  return null;
}

/** Saves the brief, or removes the key once there's nothing to keep. */
export function saveGenerateBrief(key: string, b: GenerateBrief, s: Store | null = session()): void {
  if (b.instructions.trim() === "" && b.selected.length === 0) clearDraft(key, s);
  else writeDraft(key, b, s);
}

export function clearGenerateBrief(key: string, s: Store | null = session()): void {
  clearDraft(key, s);
}

/** The handoff params as one comparable string; "" when there's none. */
export function handoffOf(note: string | null, tpl: string | null): string {
  return note || tpl ? JSON.stringify([note ?? "", tpl ?? ""]) : "";
}

/**
 * The brief the form opens with. The stored one wins when it grew from this
 * same handoff (Back returns to the same URL); a new handoff starts fresh.
 * Rules no longer in the library are dropped.
 */
export function initialBrief(
  saved: GenerateBrief | null,
  handoff: { note: string | null; tpl: string | null },
  known: (templateId: string) => boolean,
): GenerateBrief {
  const h = handoffOf(handoff.note, handoff.tpl);
  if (saved && (saved.handoff ?? "") === h) {
    return { instructions: saved.instructions, selected: saved.selected.filter(known), handoff: h };
  }
  return {
    instructions: handoff.note ?? "",
    selected: handoff.tpl && known(handoff.tpl) ? [handoff.tpl] : [],
    handoff: h,
  };
}
