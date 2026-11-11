import type {
  AiDraftDto,
  CardioPrescriptionDto,
  ChatMessageDto,
  ExerciseDto,
  ExerciseRole,
  GenerationDto,
  PrescribedSetDto,
  SessionKindDto,
  TrainerApi,
} from "./api/types";
import { latestValidatedDraft, revisionChain } from "./generation";
import { diffDrafts, shownExerciseOrder, unproposedChanges, type RoleRank, type SlotChange } from "@pt/shared";
import type { ChatProposalDto } from "./api/types";

// ---- turn submission (what Send does) ----

export type ChatTurnApi = Pick<TrainerApi, "chatTurn">;

export interface ChatTurnInput {
  clientId: string;
  target: GenerationDto | null;
  message: string;
  /** Provider/model/effort pickers (card 27tc8); omitted = draft's defaults. */
  providerId?: string;
  model?: string;
  effort?: string;
}

export interface ChatTurnResult {
  messages: ChatMessageDto[];
  /** The new validated child generation when a build produced one; null otherwise. */
  generation: GenerationDto | null;
}

/**
 * One chat turn on the chat page: the reply always lands in the transcript.
 * A change request comes back as a proposal row — nothing is rebuilt until the
 * trainer presses Build (submitBuild). With no target draft it is plain Q&A.
 */
export async function submitChatTurn(api: ChatTurnApi, input: ChatTurnInput): Promise<ChatTurnResult> {
  const trimmed = input.message.trim();
  if (!trimmed) throw new Error("message must not be empty");

  const res = await api.chatTurn({
    clientId: input.clientId,
    generationId: input.target?.id ?? null,
    message: trimmed,
    providerId: input.providerId,
    model: input.model,
    effort: input.effort,
  });
  return { messages: res.messages, generation: res.generation };
}

/**
 * Merge a finished turn into page state: transcript rows appended, and a
 * refine result's generation unshifted to the front (deduped). Inputs are
 * never mutated.
 */
export function applyChatTurn(
  prev: { messages: ChatMessageDto[]; gens: GenerationDto[] },
  result: ChatTurnResult,
): { messages: ChatMessageDto[]; gens: GenerationDto[] } {
  const messages = [...prev.messages, ...result.messages];
  if (!result.generation) {
    return { messages, gens: prev.gens };
  }
  const gens = [result.generation, ...prev.gens.filter((g) => g.id !== result.generation!.id)];
  return { messages, gens };
}

// ---- preview view model ----

export type PreviewSessionState = "skeleton" | "updated" | "unchanged";

export interface PreviewSessionCard {
  name: string;
  kind: SessionKindDto;
  cardio: CardioPrescriptionDto | null;
  exercises: {
    /** 1-based index in the raw draft session (display order is role-sorted). */
    slot: number;
    name: string;
    role?: ExerciseRole;
    movementPattern: string | null;
    sets: PrescribedSetDto[];
    group?: string;
  }[];
}

export interface PreviewSession {
  index: number;
  state: PreviewSessionState;
  card: PreviewSessionCard;
}

export interface DraftPreviewModel {
  /** Latest validated AI draft — the same generation Send revises. */
  target: GenerationDto | null;
  /** 1-based version: length of the revision chain ending at target. 0 with no target. */
  version: number;
  /** A refine turn is in flight and there is a draft to revise. */
  generating: boolean;
  /** version + 1 while generating, else null. */
  nextVersion: number | null;
  /** One entry per target.draft.sessions entry, in order. Empty with no target. */
  sessions: PreviewSession[];
}

/** Stable per-session comparison key for change detection across versions. */
interface SessionKey {
  name: string;
  kind: SessionKindDto;
  cardio: CardioPrescriptionDto | null;
  exercises: {
    id: string | null;
    name: string | null;
    role: ExerciseRole | null;
    sets: PrescribedSetDto[];
    notes: string | null;
  }[];
}

function sessionKey(s: AiDraftDto["sessions"][number]): SessionKey {
  return {
    name: s.name,
    kind: s.kind ?? "lifting",
    cardio: s.cardio ?? null,
    exercises: s.exercises.map((e) => ({
      id: e.exerciseId ?? null,
      name: e.exerciseName ?? null,
      role: e.role ?? null,
      sets: e.prescribedSets,
      notes: e.notes ?? null,
    })),
  };
}

/**
 * Indexes of next.sessions entries that differ from prev.sessions — appended
 * sessions count as changed, removals shift nothing before them. Sorted
 * ascending; empty when there is no previous draft.
 */
export function changedSessionIndexes(prev: AiDraftDto | null, next: AiDraftDto): number[] {
  if (prev === null) return [];
  const changed: number[] = [];
  for (let i = 0; i < next.sessions.length; i++) {
    const before = prev.sessions[i];
    if (before === undefined || JSON.stringify(sessionKey(before)) !== JSON.stringify(sessionKey(next.sessions[i]))) {
      changed.push(i);
    }
  }
  return changed;
}

/**
 * View model for the draft preview pane beside the chat: which draft Build
 * revises, its version, the generating state, and per-session cards marked
 * updated / unchanged. While a build is running the current version stays
 * visible (no skeletons) — the page dims it instead.
 */
export function draftPreviewModel(
  gens: GenerationDto[],
  pending: boolean,
  catalogById: ReadonlyMap<string, Pick<ExerciseDto, "movementPattern">>,
  /** The trainer's role labels — display order follows their ranks; absent = built-ins. */
  labels?: readonly RoleRank[],
): DraftPreviewModel {
  const target = latestValidatedDraft(gens);
  if (!target || !target.draft) {
    return { target: null, version: 0, generating: false, nextVersion: null, sessions: [] };
  }

  const chain = revisionChain(gens, target.id);
  const version = chain.length;
  const generating = pending && target !== null;
  const parentDraft = chain.length >= 2 ? chain[chain.length - 2].draft : null;
  const changed = new Set(changedSessionIndexes(parentDraft, target.draft));

  const sessions: PreviewSession[] = target.draft.sessions.map((s, index) => {
    // Raw draft index travels with the exercise: slot marks must not move when
    // display order is role-sorted (AI-made order only).
    const slotted = s.exercises.map((e, i) => ({ ...e, slot: i + 1 }));
    const state: PreviewSessionState = changed.has(index) ? "updated" : "unchanged";
    const card: PreviewSessionCard = {
      name: s.name,
      kind: s.kind ?? "lifting",
      cardio: s.cardio ?? null,
      exercises: shownExerciseOrder(slotted, labels, { keepOrder: target.trainerOrder }).map((e) => ({
        slot: e.slot,
        name: e.exerciseName ?? "",
        role: e.role,
        movementPattern: e.exerciseId ? catalogById.get(e.exerciseId)?.movementPattern ?? null : null,
        sets: e.prescribedSets,
        group: e.group,
      })),
    };
    return { index, state, card };
  });

  return {
    target,
    version,
    generating,
    nextVersion: generating ? version + 1 : null,
    sessions,
  };
}

// ---- propose → build ----

export interface VersionStamp {
  /** Assistant message the stamp belongs to. */
  messageId: string;
  generationId: string;
  /** 1-based version of the generation (revision chain length). */
  version: number;
  changes: SlotChange[];
  /** Changes outside the proposal; null when the version was not built from a proposal. */
  unproposed: SlotChange[] | null;
  /** The AI's changes outside the proposal that the build reverted (kept as before). */
  discarded: SlotChange[];
}

/** One stamp per assistant "draft" row whose generation has a validated draft. Keyed by message id. */
export function versionStamps(messages: ChatMessageDto[], gens: GenerationDto[]): Map<string, VersionStamp> {
  const byId = new Map(gens.map((g) => [g.id, g]));
  const proposalFor = new Map<string, ChatProposalDto>();
  for (const m of messages) if (m.proposal?.builtGenerationId) proposalFor.set(m.proposal.builtGenerationId, m.proposal);
  const out = new Map<string, VersionStamp>();
  for (const m of messages) {
    if (m.role !== "assistant" || m.kind !== "draft" || !m.generationId) continue;
    const gen = byId.get(m.generationId);
    if (!gen?.draft) continue;
    const parent = gen.parentGenerationId ? byId.get(gen.parentGenerationId) : undefined;
    const changes = parent?.draft ? diffDrafts(parent.draft, gen.draft) : [];
    const proposal = proposalFor.get(gen.id);
    out.set(m.id, {
      messageId: m.id,
      generationId: gen.id,
      version: revisionChain(gens, gen.id).length,
      changes,
      unproposed: proposal ? unproposedChanges(changes, proposal) : null,
      discarded: gen.discardedChanges ?? [],
    });
  }
  return out;
}

export type BuildApi = Pick<TrainerApi, "buildProposal">;

export async function submitBuild(
  api: BuildApi,
  input: { messageId: string; providerId?: string; model?: string; effort?: string }
): Promise<ChatTurnResult> {
  const res = await api.buildProposal(input.messageId, {
    providerId: input.providerId,
    model: input.model,
    effort: input.effort,
  });
  return { messages: res.messages, generation: res.generation.status === "validated" ? res.generation : null };
}

/** The pending child being built from `parentGenerationId`, if the poll has seen it. */
export function findBuildingChild(gens: GenerationDto[], parentGenerationId: string): GenerationDto | null {
  return gens.find((g) => g.status === "pending" && g.parentGenerationId === parentGenerationId) ?? null;
}
// ---- version view (draft pane) ----

export interface VersionView {
  /** 1-based version shown. */
  version: number;
  generation: GenerationDto;
  sessions: PreviewSessionCard[];
  /** Changes from the previous version; empty for v1. */
  changes: SlotChange[];
}

/**
 * Version `version` (1-based) of the revision chain that ends at `targetId`,
 * as preview cards plus its changes from the version before it.
 * null when the chain is shorter than `version` or the draft is missing.
 */
export function versionView(
  gens: GenerationDto[],
  targetId: string,
  version: number,
  catalogById: ReadonlyMap<string, Pick<ExerciseDto, "movementPattern">>,
  labels?: readonly RoleRank[],
): VersionView | null {
  const chain = revisionChain(gens, targetId);
  const gen = chain[version - 1];
  if (!gen?.draft) return null;
  const prev = version >= 2 ? chain[version - 2]?.draft ?? null : null;
  const sessions: PreviewSessionCard[] = gen.draft.sessions.map((s) => ({
    name: s.name,
    kind: s.kind ?? "lifting",
    cardio: s.cardio ?? null,
    exercises: shownExerciseOrder(s.exercises.map((e, i) => ({ ...e, slot: i + 1 })), labels, { keepOrder: gen.trainerOrder }).map((e) => ({
      name: e.exerciseName ?? "",
      role: e.role,
      movementPattern: e.exerciseId ? catalogById.get(e.exerciseId)?.movementPattern ?? null : null,
      sets: e.prescribedSets,
      slot: e.slot,
      group: e.group,
    })),
  }));
  return { version, generation: gen, sessions, changes: prev ? diffDrafts(prev, gen.draft) : [] };
}

/** "Day 2 · 5 changes" style counts for the draft pane summary. */
export function changeSummary(changes: SlotChange[]): string {
  const swaps = changes.filter((c) => c.kind === "swap").length;
  const rx = changes.filter((c) => c.kind === "rx").length;
  const added = changes.filter((c) => c.kind === "added").length;
  const removed = changes.filter((c) => c.kind === "removed").length;
  const sessions = changes.filter((c) => c.kind === "session").length;
  const cardio = changes.filter((c) => c.kind === "cardio").length;
  const plan = changes.filter((c) => c.kind === "plan").length;
  const p = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [
    swaps && `${p(swaps, "exercise")} swapped or renamed`,
    rx && p(rx, "prescription edit"),
    added && `${added} added`,
    removed && `${removed} removed`,
    sessions && p(sessions, "session edit"),
    cardio && p(cardio, "cardio edit"),
    plan && p(plan, "block plan edit"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Safe markdown subset for AI replies: HTML escaped, **bold**, paragraphs, line breaks, "- " lists. */
export function renderMarkdown(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return esc
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
      }
      return `<p>${inline(lines.join("<br>"))}</p>`;
    })
    .join("");
}

/** mm:ss from milliseconds. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Assistant "draft" reply text without the trailing "Draft ready: …" notice line. */
export function stripDraftNotice(content: string): string {
  return content.replace(/\n*Draft ready:[^\n]*$/, "").trim();
}
