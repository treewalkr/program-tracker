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
  /** The new validated child generation when the turn revised the draft; null otherwise. */
  generation: GenerationDto | null;
}

/**
 * One smart turn on the chat page (card 27tc8): the reply always lands in the
 * transcript; a revised draft comes back only when the message asked for
 * changes. With no target draft the turn is plain Q&A (server side).
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
