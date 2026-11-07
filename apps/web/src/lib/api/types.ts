/** DTOs + the one interface the whole UI talks to. Two impls: real (Eden) + mock.
 *  Domain shapes are re-exported from @pt/shared (single source of truth); the
 *  remaining interfaces are the seam contract both adapters are checked against. */
import type {
  CardioLog,
  CardioPrescription,
  ExerciseRole as Er,
  Phasing,
  PrescribedSet,
  ProgramWeek,
  SessionKind,
  SetType,
  Signal,
  StoredChatProposal,
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
  /** Lifting sessions per week (cardio doesn't count). */
  sessionsPerWeek: number | null;
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
  /** 1-based position on its kind's track ("Session N" / "Cardio N"); stable across weeks. */
  seq: number;
  /** ISO 1=Mon…7=Sun; null/absent = unscheduled. */
  weekday?: number | null;
  /** Order within its weekday. */
  order: number;
  kind: SessionKind;
  /** Trainer's session type; the name is captured when the session is saved. */
  typeId?: string;
  typeName?: string;
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
  /** Trainer's setup cues — shown in programs and passed to the AI. */
  note: string | null;
  /** false = library seed entry: name, muscles and equipment are locked. */
  custom: boolean;
  /** Set = archived (custom) or hidden (seed): out of pickers and AI drafts. */
  archivedAt: string | null;
  /** Programs that prescribe it. */
  usedIn: number;
}

export interface ExerciseInput {
  name: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups?: string[];
  equipment: string;
  movementPattern?: string | null;
  functionalMovement?: string | null;
  note?: string | null;
}

export type ExercisePatch = Partial<ExerciseInput> & { archived?: boolean };

export interface ProviderDto {
  id: string;
  label: string;
  model: string;
  models: string[];
  configured: boolean;
  /** Reasoning-effort levels the trainer may pick (absent = none). */
  effortLevels?: string[];
  defaultEffort?: string;
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
  /** Proposed periodization for the block (week drafts have none). */
  phasing?: ProgramPhasingDto | null;
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
  effort?: string | null;
  status: "pending" | "validated" | "failed_validation" | "failed_provider" | "approved" | "rejected" | "cancelled";
  draft: AiDraftDto | null;
  error: string | null;
  parentGenerationId: string | null;
  revisionMessage: string | null;
  /** True when the trainer edited this version by hand (no AI), e.g. the block plan. */
  manualEdit?: boolean;
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

/** Trainer-owned label over a fixed format ("lifting" | "cardio"). */
export interface SessionTypeDto {
  id: string;
  name: string;
  format: SessionKind;
  /** Set = out of the picker and AI list; programs keep the captured name. */
  archivedAt: string | null;
  /** Programs with a session of this type. */
  usedIn: number;
}

export interface SessionTypeInput {
  name: string;
  format: SessionKind;
}

export type SessionTypePatch = Partial<SessionTypeInput> & { archived?: boolean };

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

export type ChatProposalDto = StoredChatProposal;

export interface ChatMessageDto {
  id: string;
  role: "trainer" | "assistant";
  kind: "chat" | "revision" | "draft" | "error" | "proposal";
  content: string;
  generationId: string | null;
  /** Proposal payload for kind "proposal"; null/absent otherwise. */
  proposal?: ChatProposalDto | null;
  createdAt: string;
}

export interface TrainerApi {
  /** The API's build id ("0.1.3+42a93f5"); in demo mode, the web build. */
  apiBuild(): Promise<string>;
  providers(): Promise<ProviderDto[]>;
  instructionTemplates(): Promise<InstructionTemplateDto[]>;
  createInstructionTemplate(input: { name: string; content: string }): Promise<InstructionTemplateDto>;
  updateInstructionTemplate(id: string, input: { name: string; content: string }): Promise<InstructionTemplateDto>;
  deleteInstructionTemplate(id: string): Promise<void>;
  schemes(): Promise<PeriodizationSchemeDto[]>;
  createScheme(input: { name: string; weeks: WeekPlan[] }): Promise<PeriodizationSchemeDto>;
  deleteScheme(id: string): Promise<void>;
  /** Seeds the 6 defaults on a trainer's first read. */
  sessionTypes(): Promise<SessionTypeDto[]>;
  createSessionType(input: SessionTypeInput): Promise<SessionTypeDto>;
  patchSessionType(id: string, input: SessionTypePatch): Promise<SessionTypeDto>;
  /** Unused types only, never the last one; everything else archives via patchSessionType. */
  deleteSessionType(id: string): Promise<void>;
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
  createExercise(input: ExerciseInput): Promise<ExerciseDto>;
  /** Seed entries take only movementPattern, functionalMovement, note and archived. */
  patchExercise(id: string, input: ExercisePatch): Promise<ExerciseDto>;
  /** Unused custom exercises only; everything else archives via patchExercise. */
  deleteExercise(id: string): Promise<void>;

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
    effort?: string;
    instructions?: string;
  }): Promise<GenerationDto>;
  generations(clientId: string): Promise<GenerationDto[]>;
  generation(id: string): Promise<GenerationDto>;
  reviseGeneration(id: string, message: string): Promise<GenerationDto>;
  /** Save an edited block plan as the next draft version (no AI call). */
  savePhasing(generationId: string, phasing: ProgramPhasingDto): Promise<GenerationDto>;
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
  sendChatMessage(input: { clientId: string; message: string; providerId?: string; model?: string; effort?: string }): Promise<ChatMessageDto[]>;
  /** One chat turn on a draft: replies always, proposes slot changes when asked. */
  chatTurn(input: {
    clientId: string;
    generationId?: string | null;
    message: string;
    providerId?: string;
    model?: string;
    effort?: string;
  }): Promise<{ messages: ChatMessageDto[]; generation: GenerationDto | null }>;
  /** Build a proposal into the next version. Refused twice (409). */
  buildProposal(
    messageId: string,
    opts: { providerId?: string; model?: string; effort?: string }
  ): Promise<{ messages: ChatMessageDto[]; generation: GenerationDto }>;
  clearChat(clientId: string): Promise<void>;
}
