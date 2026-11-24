import type { CardioLog, LoggedBy, Readiness, SessionFlag, SessionKind, SetType } from "./domain";
import { normalizeKind } from "./sessionKind";

/** A session log as the API serializes it (GET / POST /v1/logs/sessions). */
export interface LogDtoLike {
  clientId: string;
  programId: string;
  programSessionId: string | null;
  date: string;
  kind?: SessionKind | null;
  cardio?: CardioLog | null;
  notes?: string | null;
  perceivedEnergy?: number | null;
  readiness?: Readiness | null;
  flags?: SessionFlag[] | null;
  /** Movement-prep items ticked (program-exercise ids). */
  prepDone?: readonly string[] | null;
  /** The coach's review stamp and note (ISO string from JSON). */
  reviewedAt?: string | Date | null;
  trainerFeedback?: string | null;
  sets: {
    programExerciseId?: string | null;
    exerciseId: string;
    setNumber: number;
    type: SetType;
    weightKg?: number | null;
    reps: number;
    rpe?: number | null;
  }[];
}

/** A log's coach review, written back by Undo after Replace. */
export interface LogReviewRestore {
  reviewedAt: string | null;
  trainerFeedback: string | null;
}

/** The POST body that writes the same log back. */
export interface LogRestoreInput {
  clientId: string;
  programId: string;
  programSessionId: string | null;
  date: string;
  kind: SessionKind;
  cardio: CardioLog | null;
  notes?: string;
  perceivedEnergy?: number;
  readiness: Readiness | null;
  flags: SessionFlag[] | null;
  prepDone: string[];
  /** A restore sits beside whatever is logged now — never a 409, never a swap. */
  onDuplicate: "add";
  /** The coach's review as the log had it; only when it had one (trainer route only). */
  review?: LogReviewRestore;
  sets: {
    programExerciseId: string | null;
    exerciseId: string;
    setNumber: number;
    type: SetType;
    weightKg?: number;
    reps: number;
    rpe?: number;
  }[];
}

/** A saved log → the input that re-creates it (Undo after Replace). Ids and timestamps are new. */
export function logToInput(log: LogDtoLike): LogRestoreInput {
  return {
    clientId: log.clientId,
    programId: log.programId,
    programSessionId: log.programSessionId ?? null,
    date: log.date,
    kind: normalizeKind(log.kind ?? "exercises"),
    cardio: log.cardio ? structuredClone(log.cardio) : null,
    ...(log.notes != null ? { notes: log.notes } : {}),
    ...(log.perceivedEnergy != null ? { perceivedEnergy: log.perceivedEnergy } : {}),
    readiness: log.readiness ? { ...log.readiness } : null,
    flags: log.flags ? log.flags.map((f) => ({ ...f })) : null,
    prepDone: [...(log.prepDone ?? [])],
    onDuplicate: "add",
    ...(log.reviewedAt != null || log.trainerFeedback != null
      ? {
          review: {
            reviewedAt: log.reviewedAt == null ? null : new Date(log.reviewedAt).toISOString(),
            trainerFeedback: log.trainerFeedback ?? null,
          },
        }
      : {}),
    // Order kept: set numbers repeat across exercises.
    sets: log.sets.map((s) => ({
      programExerciseId: s.programExerciseId ?? null,
      exerciseId: s.exerciseId,
      setNumber: s.setNumber,
      type: s.type,
      ...(s.weightKg != null ? { weightKg: s.weightKg } : {}),
      reps: s.reps,
      ...(s.rpe != null ? { rpe: s.rpe } : {}),
    })),
  };
}

/**
 * Owner decision D5: a member's edit of a log the coach reviewed keeps the
 * coach's note but clears the reviewed mark, so the edit shows up in Needs
 * review again with the note attached. Flip to `false` to keep the mark too.
 * The API and the mock both read it.
 */
export const MEMBER_EDIT_CLEARS_REVIEW = true;

/** A log's coach-review fields, as a row (Date) or a DTO (ISO string) holds them. */
export interface ReviewFieldsOf<T> {
  reviewedAt: T | null;
  reviewedBy: string | null;
  trainerFeedback: string | null;
}

/**
 * What a replacing log inherits from the logs it removes (newest first): the
 * newest reviewed-or-noted one's coach note, and its reviewed mark unless a
 * member's edit clears it (D5). Nothing to carry → all null.
 */
export function carriedReview<T>(
  removed: readonly { reviewedAt?: T | null; reviewedBy?: string | null; trainerFeedback?: string | null }[],
  writer: LoggedBy,
): ReviewFieldsOf<T> {
  const from = removed.find((l) => l.trainerFeedback != null || l.reviewedAt != null);
  if (!from) return { reviewedAt: null, reviewedBy: null, trainerFeedback: null };
  const clearMark = writer === "client" && MEMBER_EDIT_CLEARS_REVIEW;
  return {
    trainerFeedback: from.trainerFeedback ?? null,
    reviewedAt: clearMark ? null : (from.reviewedAt ?? null),
    reviewedBy: clearMark ? null : (from.reviewedBy ?? null),
  };
}
