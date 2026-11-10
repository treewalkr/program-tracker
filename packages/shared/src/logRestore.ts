import type { CardioLog, Readiness, SessionFlag, SessionKind, SetType } from "./domain";

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
  /** A restore sits beside whatever is logged now — never a 409, never a swap. */
  onDuplicate: "add";
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
    kind: log.kind ?? "lifting",
    cardio: log.cardio ? { ...log.cardio } : null,
    ...(log.notes != null ? { notes: log.notes } : {}),
    ...(log.perceivedEnergy != null ? { perceivedEnergy: log.perceivedEnergy } : {}),
    readiness: log.readiness ? { ...log.readiness } : null,
    flags: log.flags ? log.flags.map((f) => ({ ...f })) : null,
    onDuplicate: "add",
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
