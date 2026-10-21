/** DTOs + the one interface the whole UI talks to. Two impls: real (Eden) + mock.
 *  Domain shapes are re-exported from @pt/shared (single source of truth); the
 *  remaining interfaces are the seam contract both adapters are checked against. */
import type { Phasing, PrescribedSet, SetType, Signal, WeekDirective as Wd, WeekPlan as Wp } from "@pt/shared";

export type PrescribedSetDto = PrescribedSet;
export type WeekDirective = Wd;
export type WeekPlan = Wp;
export type ProgramPhasingDto = Phasing;
export type SignalDto = Signal;

export interface ClientDto {
  id: string;
  name: string;
  email: string;
  status: "active" | "paused" | "archived";
  goals: string | null;
  limitations: string | null;
  daysPerWeek: number | null;
  /** Planned training weekdays, ISO: 1=Mon … 7=Sun. */
  trainingDays?: number[];
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
  /** Cardio / conditioning attached to the session (zone work, intervals, easy runs). */
  conditioning?: { label: string; detail: string } | null;
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
  activatedAt?: string | null;
  phasing?: ProgramPhasingDto | null;
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
  models: string[];
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
  type: SetType;
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
    type: SetType;
    weightKg?: number | null;
    reps: number;
    rpe?: number | null;
  }[];
}

export interface InstructionTemplateDto {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface PeriodizationSchemeDto {
  id: string;
  name: string;
  weeks: WeekPlan[];
}

export interface TrainerApi {
  providers(): Promise<ProviderDto[]>;
  instructionTemplates(): Promise<InstructionTemplateDto[]>;
  createInstructionTemplate(input: { name: string; content: string }): Promise<InstructionTemplateDto>;
  updateInstructionTemplate(id: string, input: { name: string; content: string }): Promise<InstructionTemplateDto>;
  deleteInstructionTemplate(id: string): Promise<void>;
  schemes(): Promise<PeriodizationSchemeDto[]>;
  createScheme(input: { name: string; weeks: WeekPlan[] }): Promise<PeriodizationSchemeDto>;
  deleteScheme(id: string): Promise<void>;
  clients(): Promise<ClientDto[]>;
  client(id: string): Promise<{ client: ClientDto; currentProgram: ProgramDto | null; programs: ProgramDto[] }>;
  createClient(input: Omit<ClientDto, "id" | "status">): Promise<ClientDto>;
  updateClient(id: string, patch: Partial<ClientDto>): Promise<ClientDto>;

  program(id: string): Promise<ProgramDto>;
  programs(clientId: string): Promise<ProgramDto[]>;
  saveProgram(id: string, sessions: ProgramSessionDto[]): Promise<ProgramDto>;
  createProgram(input: {
    clientId: string;
    name: string;
    description?: string | null;
    sessions: ProgramSessionDto[];
    phasing?: ProgramPhasingDto | null;
  }): Promise<ProgramDto>;
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
    model?: string;
    instructions?: string;
  }): Promise<GenerationDto>;
  generations(clientId: string): Promise<GenerationDto[]>;
  approveGeneration(id: string): Promise<ProgramDto>;
  rejectGeneration(id: string): Promise<GenerationDto>;

  /** Phase-change signals, snooze-filtered (computed by the shared engine). */
  notifications(): Promise<SignalDto[]>;
  snoozeSignal(id: string, until: string): Promise<void>;
}
