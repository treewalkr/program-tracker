/** DTOs + the one interface the whole UI talks to. Two impls: real (Eden) + mock.
 *  Domain shapes are re-exported from @pt/shared (single source of truth); the
 *  remaining interfaces are the seam contract both adapters are checked against. */
import type {
  CardioLog,
  CardioPrescription,
  ExerciseRole as Er,
  Phasing,
  PrescribedSet,
  ProgramDay,
  ProgramWeek,
  SessionKind,
  SetType,
  Signal,
  WeekDirective as Wd,
  WeekMetric as Wm,
  WeekPlan as Wp,
  WeekSummaryStats,
} from "@pt/shared";

export type PrescribedSetDto = PrescribedSet;
export type ExerciseRole = Er;
export type WeekDirective = Wd;
export type WeekMetric = Wm;
export type WeekPlan = Wp;
export type ProgramPhasingDto = Phasing;
export type SignalDto = Signal;
export type ProgramWeekDto = ProgramWeek;
export type ProgramDayDto = ProgramDay;
export type CardioPrescriptionDto = CardioPrescription;
export type SessionKindDto = SessionKind;
export type CardioLogDto = CardioLog;
export type WeekSummaryStatsDto = WeekSummaryStats;

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
  /** Standing weekly cardio target — null/undefined = none. */
  cardioTarget?: { unit: "minutes" | "sessions" | "zone_minutes"; value: number } | null;
}

export interface ProgramExerciseDto {
  id: string;
  exerciseId: string;
  exerciseName?: string;
  role?: ExerciseRole;
  order: number;
  prescribedSets: PrescribedSetDto[];
  notes?: string;
}

export interface ProgramSessionDto {
  id: string;
  name: string;
  order: number;
  kind: SessionKind;
  notes?: string;
  exercises: ProgramExerciseDto[];
  cardio?: CardioPrescriptionDto | null;
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
  weeks: ProgramWeekDto[];
  direction?: string | null;
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
  movementPattern: string | null;
  functionalMovement: string | null;
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
  role?: ExerciseRole;
  prescribedSets: PrescribedSetDto[];
  notes?: string;
}

export interface AiDraftDto {
  name: string;
  rationale: string;
  clientSummary: string;
  sessions: {
    name: string;
    kind?: SessionKind;
    notes?: string;
    exercises: DraftExerciseRef[];
    cardio?: CardioPrescriptionDto | null;
  }[];
}

export interface GenerationDto {
  id: string;
  clientId: string;
  basedOnProgramId: string | null;
  kind: "block" | "week";
  targetWeek: number | null;
  direction?: string | null;
  providerId: string;
  model: string;
  status: "pending" | "validated" | "failed_validation" | "failed_provider" | "approved" | "rejected" | "cancelled";
  draft: AiDraftDto | null;
  error: string | null;
  parentGenerationId: string | null;
  revisionMessage: string | null;
  instructions: string | null;
  rejectReason: string | null;
  approvedProgramId: string | null;
  /** Example programs whose text was injected into this generation's prompt. */
  exampleProgramIds: string[];
  createdAt: string;
}

export interface ClientMessageDto {
  id: string;
  clientId: string;
  programId: string | null;
  week: number;
  providerId: string;
  model: string;
  status: "pending" | "validated" | "failed_validation" | "failed_provider" | "approved" | "rejected";
  draft: { message: string } | null;
  stats: WeekSummaryStatsDto | null;
  finalText: string | null;
  error: string | null;
  createdAt: string;
}

export interface ProgramExampleDto {
  id: string;
  programId: string;
  goal: string;
  level: "beginner" | "intermediate" | "advanced";
  daysPerWeek: number;
  note: string | null;
  createdAt: string;
  program: ProgramDto;
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
  kind?: SessionKind;
  cardio?: CardioLogDto | null;
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
  kind: SessionKind;
  cardio?: CardioLogDto | null;
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

export interface PreferencesDto {
  id: string;
  clientId: string | null;
  clientName: string | null;
  document: string;
  providerId: string;
  model: string;
  updatedAt: string;
}

export interface PeriodizationSchemeDto {
  id: string;
  name: string;
  weeks: WeekPlan[];
}

export interface KineticChainDto {
  id: string;
  name: string;
  muscleGroups: string[];
  sortOrder: number;
}

export interface ChainWeekDto {
  weekStart: string;
  chains: {
    id: string;
    name: string;
    muscleGroups: string[];
    sets: number;
  }[];
}

export interface ChatMessageDto {
  id: string;
  role: "trainer" | "assistant";
  kind: "chat" | "revision" | "draft" | "error";
  content: string;
  generationId: string | null;
  createdAt: string;
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
  saveProgram(id: string, weeks: ProgramWeekDto[], phasing?: ProgramPhasingDto | null): Promise<ProgramDto>;
  createProgram(input: {
    clientId: string;
    name: string;
    description?: string | null;
    weeks: ProgramWeekDto[];
    phasing?: ProgramPhasingDto | null;
    createdFromProgramId?: string | null;
  }): Promise<ProgramDto>;
  setProgramStatus(id: string, status: ProgramDto["status"]): Promise<ProgramDto>;
  saveProgramDirection(id: string, direction: string | null): Promise<ProgramDto>;

  examples(programId?: string): Promise<ProgramExampleDto[]>;
  createExample(input: {
    programId: string;
    goal: string;
    level: ProgramExampleDto["level"];
    daysPerWeek?: number;
    note?: string | null;
  }): Promise<ProgramExampleDto>;
  updateExample(
    id: string,
    patch: {
      goal?: string;
      level?: ProgramExampleDto["level"];
      daysPerWeek?: number;
      note?: string | null;
    }
  ): Promise<ProgramExampleDto>;
  deleteExample(id: string): Promise<void>;

  exercises(query?: string): Promise<ExerciseDto[]>;
  createExercise(input: {
    name: string;
    primaryMuscleGroup: string;
    equipment: string;
    movementPattern?: string | null;
    functionalMovement?: string | null;
  }): Promise<ExerciseDto>;
  patchExercise(
    id: string,
    input: { movementPattern?: string | null; functionalMovement?: string | null }
  ): Promise<ExerciseDto>;

  history(clientId: string): Promise<HistoryEntryDto[]>;
  sessionLogs(clientId: string): Promise<SessionLogDto[]>;
  logSession(input: SessionLogInput): Promise<unknown>;

  generate(input: {
    clientId: string;
    basedOnProgramId?: string | null;
    targetWeek?: number;
    direction?: string;
    providerId?: string;
    model?: string;
    instructions?: string;
  }): Promise<GenerationDto>;
  generations(clientId: string): Promise<GenerationDto[]>;
  generation(id: string): Promise<GenerationDto>;
  reviseGeneration(id: string, message: string): Promise<GenerationDto>;
  approveGeneration(id: string): Promise<ProgramDto>;
  rejectGeneration(id: string, reason?: string): Promise<GenerationDto>;
  cancelGeneration(id: string): Promise<GenerationDto>;

  preferences(): Promise<PreferencesDto[]>;
  distillPreferences(input: {
    clientId?: string | null;
    providerId?: string;
    model?: string;
  }): Promise<PreferencesDto>;
  deletePreference(id: string): Promise<void>;

  generateClientMessage(input: {
    clientId: string;
    programId: string;
    week: number;
    providerId?: string;
    model?: string;
  }): Promise<ClientMessageDto>;
  clientMessages(clientId: string): Promise<ClientMessageDto[]>;
  clientMessage(id: string): Promise<ClientMessageDto>;
  approveClientMessage(id: string, text?: string): Promise<ClientMessageDto>;
  rejectClientMessage(id: string): Promise<ClientMessageDto>;

  /** Phase-change signals, snooze-filtered (computed by the shared engine). */
  notifications(): Promise<SignalDto[]>;
  snoozeSignal(id: string, until: string): Promise<void>;

  chains(): Promise<KineticChainDto[]>;
  updateChain(id: string, input: { muscleGroups: string[] }): Promise<KineticChainDto>;
  chainWeek(clientId: string): Promise<ChainWeekDto>;

  chatMessages(clientId: string): Promise<ChatMessageDto[]>;
  sendChatMessage(input: { clientId: string; message: string; providerId?: string; model?: string }): Promise<ChatMessageDto[]>;
  reviseViaChat(input: { generationId: string; message: string }): Promise<{ messages: ChatMessageDto[]; generation: GenerationDto }>;
  clearChat(clientId: string): Promise<void>;
}
