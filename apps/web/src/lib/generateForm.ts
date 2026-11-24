import { INSTRUCTIONS_MAX, MAX_AI_BLOCK_WEEKS, MIN_BLOCK_WEEKS, isAlternating, typicalGenerationSeconds, type WeeksChoice } from "@pt/shared";
import { localIso } from "./overview";
import { revisionChain } from "./generation";
import type { ClientDto, GenerationDto, InstructionTemplateDto, ProgramDto, SessionLogDto } from "./api/types";

/** Pure derivations for the generate form: titles, the "What the AI reads" ledger, and the request body. */

export const LOG_WINDOW_DAYS = 56;
export const DIRECTION_MAX = 500;

export type Lamp = "green" | "amber" | "gray";
export interface LedgerRow {
  key: string;
  value: string;
  lamp: Lamp;
  link?: { href: string; label: string };
}
export interface SummaryBit {
  lamp: Lamp;
  text: string;
}
export type StarterMode = "cold" | "active" | "week";

export const STARTERS: Record<StarterMode, string[]> = {
  cold: [
    "Build a first block around the main goal",
    "Full-body sessions, main lifts twice a week",
    "Start conservative — new to logging",
  ],
  active: [
    "Push the main lift's volume, keep the rest at maintenance",
    "Swap anything rated above RPE 9",
    "Same structure, next block",
  ],
  week: [
    "A session was missed — redistribute the volume",
    "Hold loads flat this week",
    "Drop accessories, keep the main lifts",
  ],
};

const s = (n: number) => (n === 1 ? "" : "s");

export function starterMode(current: ProgramDto | null, weekMode: number | null): StarterMode {
  if (weekMode !== null) return "week";
  return current ? "active" : "cold";
}

/** The draft program of the newest approved block generation, while it is still not active. */
export function pendingProgram(gens: GenerationDto[], programs: ProgramDto[]): ProgramDto | null {
  let newest: GenerationDto | null = null;
  for (const g of gens) {
    if (g.status !== "approved" || g.kind !== "block" || !g.approvedProgramId) continue;
    if (!newest || g.createdAt > newest.createdAt) newest = g;
  }
  if (!newest) return null;
  return programs.find((p) => p.id === newest.approvedProgramId && p.status === "draft") ?? null;
}

/** The draft version (v1, v2…) a program was approved from — the program's own version is always 1 for a new block. */
export function approvedDraftVersion(gens: GenerationDto[], programId: string): number | null {
  const g = gens.find((x) => x.approvedProgramId === programId);
  return g ? revisionChain(gens, g.id).length : null;
}

export function recentLogCount(logs: SessionLogDto[], now: Date = new Date()): number {
  const since = localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - LOG_WINDOW_DAYS));
  return logs.filter((l) => l.date >= since).length;
}

export function generateTitle(current: ProgramDto | null, weekMode: number | null): string {
  if (weekMode) return `Draft week ${weekMode} with AI`;
  return current ? "Draft the next block" : "Draft a block with AI";
}

export function generateSubtitle(i: {
  firstName: string;
  current: ProgramDto | null;
  weekMode: number | null;
  plannedWeeks: number;
  recentLogs: number;
}): string {
  const { firstName, current, weekMode: w, plannedWeeks, recentLogs: n } = i;
  if (w) {
    return `Re-drafts ${firstName}'s week ${w} of ${plannedWeeks} from this week's logs. The pre-drafted week ${w} is replaced when you approve.`;
  }
  if (current) {
    return n > 0
      ? `Builds on “${current.name}” for ${firstName} and ${n} logged session${s(n)} from the last 8 weeks.`
      : `Builds on “${current.name}” for ${firstName}. No sessions logged in the last 8 weeks.`;
  }
  return n > 0
    ? `${firstName} has no active program; this draft reads the profile and ${n} logged session${s(n)} from the last 8 weeks.`
    : `${firstName} has no active program and no logged sessions, so this draft starts from the profile alone.`;
}

/** Split the composer into the generate body: "keep" sends the note as the block direction. */
export function composeRequest(i: {
  note: string;
  keep: boolean;
  weekMode: number | null;
  templates: InstructionTemplateDto[];
}): { instructions: string; direction: string; directionTooLong: boolean } {
  const t = i.note.trim();
  const c = i.templates.map((x) => x.content);
  const asDirection = i.weekMode === null && i.keep;
  const instructions = (asDirection ? c : [...c, t]).filter(Boolean).join("\n\n");
  const direction = asDirection ? t : "";
  return { instructions, direction, directionTooLong: direction.length > DIRECTION_MAX };
}

export interface BriefMeter {
  /** Characters the API gets: `instructions` exactly, "\n\n" separators included. */
  used: number;
  max: number;
  /** Show the count from 75% of the limit. */
  show: boolean;
  over: boolean;
  overBy: number;
  /** Who takes the room: the note (0 when it goes as the direction) and the rules with their separators. */
  split: { note: number; rules: number };
  /** The smallest ticked rule that brings the brief back under the limit on its own. */
  fixRule: { id: string; name: string } | null;
}

/** How full the rules + note brief is against the AI's limit (INSTRUCTIONS_MAX). */
export function briefMeter(i: {
  /** composeRequest's `instructions`. */
  instructions: string;
  note: string;
  /** The note goes as the block direction, not in the instructions. */
  keep: boolean;
  templates: InstructionTemplateDto[];
}): BriefMeter {
  const max = INSTRUCTIONS_MAX;
  const used = i.instructions.length;
  const overBy = Math.max(0, used - max);
  const noteText = i.keep ? "" : i.note.trim();
  /** Brief length with the k-th rule turned off (composeRequest's join). */
  const without = (k: number) =>
    [...i.templates.filter((_, j) => j !== k).map((t) => t.content), noteText].filter(Boolean).join("\n\n").length;
  let fixRule: BriefMeter["fixRule"] = null;
  if (overBy > 0) {
    let best = Infinity;
    i.templates.forEach((t, k) => {
      if (t.content.length < best && used - without(k) >= overBy) {
        best = t.content.length;
        fixRule = { id: t.id, name: t.name };
      }
    });
  }
  const note = noteText.length;
  return { used, max, show: used >= 0.75 * max, over: overBy > 0, overBy, split: { note, rules: used - note }, fixRule };
}

/** Mirrors the prompt lines in the API's buildGenerationMessages. */
export function instructionsPreview(i: { direction: string; learned: string | null; instructions: string }): string {
  const parts: string[] = [];
  const d = i.direction.trim();
  if (d) parts.push(`STANDING DIRECTION (block-level — applies to every generation of this block): ${d}`);
  if (i.learned) {
    parts.push(
      `LEARNED PREFERENCES (the trainer's standing style, distilled from past feedback — apply alongside the rules above):\n${i.learned}`
    );
  }
  parts.push(`TRAINER INSTRUCTIONS: ${i.instructions || "none"}`);
  return parts.join("\n\n");
}

export function ledgerRows(i: {
  clientId: string;
  client: ClientDto;
  current: ProgramDto | null;
  pending: ProgramDto | null;
  weekMode: number | null;
  plannedWeeks: number;
  recentLogs: number;
  periodContext: string | null;
  templates: InstructionTemplateDto[];
  learned: string | null;
  /** Names of the example programs the AI will see. */
  matchedExamples: string[];
}): LedgerRow[] {
  const { client, current, pending, recentLogs: n } = i;
  const m = i.matchedExamples.length;
  const profileLink = { href: `/clients/${i.clientId}#settings`, label: "Add on profile" };
  const rows: LedgerRow[] = [];

  const profile = [client.goals ? `Goal ${client.goals}` : "", client.sessionsPerWeek ? `${client.sessionsPerWeek} sessions/week` : ""]
    .filter(Boolean)
    .join(" · ");
  rows.push(
    profile
      ? { key: "Profile", value: profile, lamp: "green" }
      : { key: "Profile", value: "No goals or sessions per week set", lamp: "gray", link: profileLink }
  );

  rows.push(
    client.limitations
      ? { key: "Limitations", value: client.limitations, lamp: "green" }
      : { key: "Limitations", value: "None recorded", lamp: "gray", link: profileLink }
  );

  if (current) {
    const week = i.weekMode ? ` · week ${i.weekMode} of ${i.plannedWeeks}` : "";
    rows.push({ key: "Program", value: `${current.name} · v${current.version}${week}`, lamp: "green" });
  } else if (pending) {
    rows.push({
      key: "Program",
      // the program row's own version (v1) isn't the draft version the trainer approved: name it instead
      value: `None active — “${pending.name}” is approved but not active`,
      lamp: "amber",
      link: { href: `/programs/${pending.id}`, label: "Open program" },
    });
  } else {
    rows.push({ key: "Program", value: "None — cold start", lamp: "gray" });
  }

  rows.push(
    n > 0
      ? { key: "Training logs", value: `${n} session${s(n)} in the last 8 weeks`, lamp: "green" }
      : { key: "Training logs", value: "None logged in the last 8 weeks", lamp: "gray" }
  );

  if (current) {
    rows.push(
      i.periodContext
        ? { key: "Block plan", value: i.periodContext, lamp: "green" }
        : { key: "Block plan", value: "No block plan on this program", lamp: "gray" }
    );
  }

  rows.push(
    i.templates.length
      ? { key: "Templates", value: i.templates.map((t) => t.name).join(", "), lamp: "green" }
      : { key: "Templates", value: "None selected", lamp: "gray", link: { href: "/templates", label: "Manage templates" } }
  );

  rows.push(
    i.learned
      ? { key: "Learned preferences", value: "Applied — distilled from your past feedback", lamp: "green" }
      : { key: "Learned preferences", value: "None yet — they build up from your feedback", lamp: "gray" }
  );

  rows.push(
    m > 0
      ? {
          key: "Example programs",
          value: `${m} matched by goal, level and days/week: ${i.matchedExamples.join(", ")}`,
          lamp: "green",
        }
      : { key: "Example programs", value: "None matched in your library", lamp: "gray", link: { href: "/examples", label: "Add examples" } }
  );

  return rows;
}

export function summaryLine(i: {
  client: ClientDto;
  current: ProgramDto | null;
  pending: ProgramDto | null;
  recentLogs: number;
  rulesOn: number;
}): SummaryBit[] {
  const { client, current, pending, recentLogs: n, rulesOn } = i;
  return [
    { lamp: client.goals || client.sessionsPerWeek ? "green" : "gray", text: "Profile" },
    current
      ? { lamp: "green", text: "Active block" }
      : pending
        ? { lamp: "amber", text: `v${pending.version} not active` }
        : { lamp: "gray", text: "No program" },
    n > 0 ? { lamp: "green", text: `${n} session${s(n)} logged` } : { lamp: "gray", text: "No logs" },
    { lamp: rulesOn > 0 ? "green" : "gray", text: `${rulesOn} rule${s(rulesOn)}` },
  ];
}

// ---- block length and Weeks (FB-013) ----

/** Block length the field starts at: the current program's (2–12), else 4. */
export function defaultBlockWeeks(current: Pick<ProgramDto, "phasing" | "weeks"> | null): number {
  const n = current?.phasing?.plannedWeeks ?? current?.weeks.length ?? 4;
  return Math.min(MAX_AI_BLOCK_WEEKS, Math.max(MIN_BLOCK_WEEKS, n));
}

/** The Weeks choice the page starts on: the current program's setting, else the trainer's last choice. */
export function defaultWeeksChoice(current: Pick<ProgramDto, "weeks"> | null, last: WeeksChoice): WeeksChoice {
  if (current) return isAlternating(current.weeks) ? "alternate" : "same";
  return last;
}

/** Rough wait for a whole block: one week's typical time per week. */
export function estimatedWaitSeconds(providerId: string, weeks: number): number {
  return typicalGenerationSeconds(providerId) * weeks;
}

/** "about 20 s" / "about 4 min". */
export function waitLabel(seconds: number): string {
  return seconds < 90 ? `about ${Math.max(5, Math.round(seconds / 5) * 5)} s` : `about ${Math.round(seconds / 60)} min`;
}
