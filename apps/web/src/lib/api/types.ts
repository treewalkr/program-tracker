/** DTOs + the one interface the whole UI talks to. Two impls: real REST + mock. */

export interface ClientDto {
  id: string;
  name: string;
  email: string;
  status: "active" | "paused" | "archived";
  goals: string | null;
  limitations: string | null;
  daysPerWeek: number | null;
}

export interface PrescribedSetDto {
  setNumber: number;
  type: "warm_up" | "working" | "backoff";
  reps: number;
  amrap: boolean;
  targetRpe?: number;
  restSeconds?: number;
}

export interface ProgramExerciseDto {
  id: string;
  exerciseId: string;
  exerciseName?: string;
  order: number;
  prescribedSets: PrescribedSetDto[];
  notes?: string;
}

export interface ProgramSessionDto {
  id: string;
  name: string;
  order: number;
  notes?: string;
  exercises: ProgramExerciseDto[];
}

export interface ProgramDto {
  id: string;
  clientId: string | null;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  version: number;
  aiAssisted: boolean;
  createdFromProgramId: string | null;
  sessions: ProgramSessionDto[];
  createdAt: string;
}

export interface ExerciseDto {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string;
}

export interface ProviderDto {
  id: string;
  label: string;
  model: string;
  configured: boolean;
}

export interface HistoryEntryDto {
  exerciseId?: string;
  exerciseName: string;
  recentSets: string[];
  bestE1rm: number;
}

export interface DraftExerciseRef {
  exerciseId?: string;
  exerciseName?: string;
  prescribedSets: PrescribedSetDto[];
  notes?: string;
}

export interface AiDraftDto {
  name: string;
  rationale: string;
  clientSummary: string;
  sessions: { name: string; notes?: string; exercises: DraftExerciseRef[] }[];
}

export interface GenerationDto {
  id: string;
  clientId: string;
  basedOnProgramId: string | null;
  providerId: string;
  model: string;
  status: "pending" | "validated" | "failed_validation" | "failed_provider" | "approved" | "rejected";
  draft: AiDraftDto | null;
  error: string | null;
  createdAt: string;
}

export interface LogSetInput {
  programExerciseId?: string | null;
  exerciseId: string;
  setNumber: number;
  type: "warm_up" | "working" | "backoff";
  weightKg?: number;
  reps: number;
  rpe?: number;
}

export interface SessionLogInput {
  clientId: string;
  programId: string;
  programSessionId?: string | null;
  date: string;
  notes?: string;
  perceivedEnergy?: number;
  sets: LogSetInput[];
}

export interface SessionLogDto {
  id: string;
  clientId: string;
  programId: string;
  programSessionId: string | null;
  date: string;
  notes: string | null;
  perceivedEnergy: number | null;
  sets: {
    id?: string;
    exerciseId: string;
    setNumber: number;
    type: "warm_up" | "working" | "backoff";
    weightKg?: number | null;
    reps: number;
    rpe?: number | null;
  }[];
}

export interface TrainerApi {
  providers(): Promise<ProviderDto[]>;
  clients(): Promise<ClientDto[]>;
  client(id: string): Promise<{ client: ClientDto; currentProgram: ProgramDto | null; programs: ProgramDto[] }>;
  createClient(input: Omit<ClientDto, "id" | "status">): Promise<ClientDto>;
  updateClient(id: string, patch: Partial<ClientDto>): Promise<ClientDto>;

  program(id: string): Promise<ProgramDto>;
  programs(clientId: string): Promise<ProgramDto[]>;
  saveProgram(id: string, sessions: ProgramSessionDto[]): Promise<ProgramDto>;
  setProgramStatus(id: string, status: ProgramDto["status"]): Promise<ProgramDto>;

  exercises(query?: string): Promise<ExerciseDto[]>;
  createExercise(input: { name: string; primaryMuscleGroup: string; equipment: string }): Promise<ExerciseDto>;

  history(clientId: string): Promise<HistoryEntryDto[]>;
  sessionLogs(clientId: string): Promise<SessionLogDto[]>;
  logSession(input: SessionLogInput): Promise<unknown>;

  generate(input: {
    clientId: string;
    basedOnProgramId?: string | null;
    providerId?: string;
    instructions?: string;
  }): Promise<GenerationDto>;
  generations(clientId: string): Promise<GenerationDto[]>;
  approveGeneration(id: string): Promise<ProgramDto>;
  rejectGeneration(id: string): Promise<GenerationDto>;
}
