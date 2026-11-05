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
import { sortExercisesByRole } from "@pt/shared";

// ---- turn submission (what Send / Ask do) ----

export type ChatTurnMode = "refine" | "ask";

export type ChatTurnApi = Pick<TrainerApi, "reviseViaChat" | "sendChatMessage">;

export interface ChatTurnInput {
  clientId: string;
  target: GenerationDto | null;
  message: string;
  mode: ChatTurnMode;
}

export interface ChatTurnResult {
  messages: ChatMessageDto[];
  /** The new validated child generation for a refine turn; null for an ask turn. */
  generation: GenerationDto | null;
}

/**
 * One Send on the chat page. When a draft target exists and mode is "refine",
 * the turn revises that draft via reviseViaChat (auto-apply — no Apply tap);
 * every other path is plain Q&A via sendChatMessage.
 */
export async function submitChatTurn(api: ChatTurnApi, input: ChatTurnInput): Promise<ChatTurnResult> {
  const trimmed = input.message.trim();
  if (!trimmed) throw new Error("message must not be empty");

  if (input.mode === "refine" && input.target !== null) {
    const res = await api.reviseViaChat({ generationId: input.target.id, message: trimmed });
    return { messages: res.messages, generation: res.generation };
  }

  const rows = await api.sendChatMessage({ clientId: input.clientId, message: trimmed });
  return { messages: rows, generation: null };
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
    name: string;
    role?: ExerciseRole;
    movementPattern: string | null;
    sets: PrescribedSetDto[];
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
 * View model for the draft preview pane beside the chat: which draft Send
 * will revise, its version, the generating state, and per-session cards
 * marked skeleton (while generating) / updated / unchanged.
 */
export function draftPreviewModel(
  gens: GenerationDto[],
  pending: boolean,
  catalogById: ReadonlyMap<string, Pick<ExerciseDto, "movementPattern">>,
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
    const state: PreviewSessionState = generating
      ? "skeleton"
      : changed.has(index)
        ? "updated"
        : "unchanged";
    const card: PreviewSessionCard = {
      name: s.name,
      kind: s.kind ?? "lifting",
      cardio: s.cardio ?? null,
      exercises: sortExercisesByRole(s.exercises).map((e) => ({
        name: e.exerciseName ?? "",
        role: e.role,
        movementPattern: e.exerciseId ? catalogById.get(e.exerciseId)?.movementPattern ?? null : null,
        sets: e.prescribedSets,
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
