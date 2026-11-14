/** DTOs + the one interface the whole UI talks to. Two impls: real (Eden) + mock.
 *  Domain shapes are re-exported from @pt/shared (single source of truth); the
 *  remaining interfaces are the seam contract both adapters are checked against. */
import type {
  CardioLog,
  DraftEditOp,
  CardioPrescription,
  DeloadSettings,
  WeeksChoice,
  ExerciseRole as Er,
  OneRepMaxes,
  Phasing,
  PrescribedSet,
  ProgramExercise,
  ProgramSession,
  ProgramWeek,
  SessionKind,
  SetType,
  SlotChange,
  Signal,
  StoredChatProposal,
  WeekDirective as Wd,
  WeekMetric as Wm,
  WeekPlan as Wp,
  WeekSummaryStats,
  LlmReasonTag,
  NoteAnchor,
  NoteScope,
  CoachingRuleCategory,
  CoachingRuleSource,
  CoachingRuleStatus,
  HistorySkip,
  ImportResult,
  ImportStatus,
  RoleLabel,
  GlossaryKind,
  GlossaryTerm,
  GlossaryTermInput,
  VocabularyAlias,
  Readiness,
  SessionFlag,
} from "@pt/shared";
import type { Treaty } from "@elysiajs/eden";
import type { client } from "./treaty";

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
export type ReadinessDto = Readiness;
export type SessionFlagDto = SessionFlag;
export type WeekSummaryStatsDto = WeekSummaryStats;

/** GET /v1/clients/roster, inferred from the Elysia route via Eden Treaty. */
type RosterGet = typeof client.v1.clients.roster.get;
export type RosterQuery = NonNullable<NonNullable<Parameters<RosterGet>[0]>["query"]>;
/** One page of the roster + per-status counts (counts honour `q`, not `status`). */
export type RosterPageDto = Extract<NonNullable<Awaited<ReturnType<RosterGet>>["data"]>, { items: unknown }>;
/** A roster row: the client's list fields plus training status. */
export type RosterRowDto = RosterPageDto["items"][number];

export interface ClientDto {
  id: string;
  name: string;
  /** Optional — null when the trainer left it blank. Display/search only. */
  email: string | null;
  status: "active" | "paused" | "archived";
  goals: string | null;
  limitations: string | null;
  /** Lifting sessions per week (cardio doesn't count). */
  sessionsPerWeek: number | null;
  /** Planned training weekdays, ISO: 1=Mon … 7=Sun. */
  trainingDays?: number[];
  /** Standing weekly cardio target — null/undefined = none. */
  cardioTarget?: { unit: "minutes" | "sessions" | "zone_minutes"; value: number } | null;
  /** ISO weekdays available for cardio on top of trainingDays; null/absent = trainingDays. */
  cardioDays?: number[] | null;
  /** ISO weekday the long run is pinned to; null/absent = the placer decides. */
  longRunDay?: number | null;
  /** exerciseId → { kg, date }; null/absent = none recorded. %1RM sets resolve against it. */
  oneRepMaxes?: OneRepMaxes | null;
  /** Client basics — all optional; null/absent = not set. Dates are YYYY-MM-DD calendar days
   *  (the API client may revive them into Dates — read them through `calendarDate`). */
  experience?: "beginner" | "intermediate" | "advanced" | null;
  birthDate?: string | null;
  /** null/absent = not specified. */
  sex?: "female" | "male" | null;
  bodyweightKg?: number | null;
  heightCm?: number | null;
  /** Day the client started. Admin-only — never sent to the AI. */
  startedOn?: string | null;
  /** Contact phone. Admin-only — never sent to the AI. */
  phone?: string | null;
  /** ISO timestamp; absent on older mock fixtures. */
  createdAt?: string;
  /** This client's own deload rule; null/absent = the trainer's. */
  deloadSettings?: DeloadSettings | null;
  /** The deload rule in force for this client (override, else the trainer's, else the default).
   *  Read it through `clientDeload` — absent on fixtures built by hand. */
  effectiveDeload?: DeloadSettings;
}

export type ProgramExerciseDto = ProgramExercise;
export type ProgramSessionDto = ProgramSession;

/** A wire shape as pages see it: `unwrap` in real.ts turns every Eden-revived
 *  Date back into its ISO string (`datesToIso`), so the mock can share it. */
export type Wire<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

/** GET /v1/programs/:id, inferred from the Elysia route via Eden Treaty. */
export type ProgramDto = Wire<Treaty.Data<ReturnType<typeof client.v1.programs>["get"]>>;

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
  /** Superset letter shared by adjacent members. */
  group?: string;
}

export interface AiDraftDto {
  name: string;
  rationale: string;
  clientSummary: string;
  /** Proposed periodization for the block (week drafts have none). */
  phasing?: ProgramPhasingDto | null;
  /** Every week in full (a week draft has just its target week). */
  weeks: AiDraftWeekDto[];
}

export interface AiDraftSessionDto {
  name: string;
  kind?: SessionKind;
  /** Name of one of the trainer's session types. */
  type?: string;
  /** AI-suggested ISO weekday; kept on approval when it passes the placement rules. */
  weekday?: number | null;
  notes?: string;
  exercises: DraftExerciseRef[];
  cardio?: CardioPrescriptionDto | null;
}

export interface AiDraftWeekDto {
  week: number;
  /** A/B letter when the block alternates (odd = A, even = B). */
  rotation?: "A" | "B";
  /** Fill drafts: a week the trainer wrote, kept as is. */
  locked?: boolean;
  sessions: AiDraftSessionDto[];
}

export interface GenerationDto {
  id: string;
  clientId: string;
  basedOnProgramId: string | null;
  kind: "block" | "week" | "fill";
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
  /** True once the trainer has hand-edited the exercise order: shown and approved as stored, never role-sorted. */
  trainerOrder?: boolean;
  /** Proposal builds: the AI's changes outside the proposal, reverted before storing; null otherwise. */
  discardedChanges?: SlotChange[] | null;
  instructions: string | null;
  rejectReason: string | null;
  approvedProgramId: string | null;
  /** Example programs whose text was injected into this generation's prompt. */
  exampleProgramIds: string[];
  createdAt: string;
}

/** A stored paste import (ai_imports). `result` is null until done. */
export interface ImportDto {
  id: string;
  clientId: string;
  /** The paste as stored (line endings normalized) — the review's left pane. */
  text: string;
  providerId: string;
  model: string;
  effort: string | null;
  status: ImportStatus;
  chunksTotal: number;
  chunksDone: number;
  result: ImportResult | null;
  error: string | null;
  /** History import: the archived programs saved from this import's logged numbers; null = not saved. */
  historyProgramIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

/** Save history: one start date per week of the result, and each name as written → exercise. */
export interface ImportHistoryInput {
  weekStarts: string[];
  /** historyExerciseKey(sourceName) → catalog exercise id. */
  exercises: Record<string, string>;
}

export interface ImportHistorySavedDto {
  programs: { id: string; name: string }[];
  sessions: number;
  sets: number;
  /** What was left out, with why (never silent). */
  skipped: HistorySkip[];
}

/** A recent import in the list — no text or result, a preview instead. */
export interface ImportSummaryDto {
  id: string;
  clientId: string;
  status: ImportStatus;
  providerId: string;
  model: string;
  chunksTotal: number;
  chunksDone: number;
  /** The paste's first 120 characters. */
  preview: string;
  createdAt: string;
}

/** One of the trainer's role labels: a built-in (overrides applied) or their own. */
export type RoleLabelDto = RoleLabel;

export interface RoleLabelInput {
  name: string;
  /** Chip text; absent = the name. */
  chip?: string;
  /** One-line meaning — required; it also reaches the AI. */
  description: string;
  /** Key of the label this one sorts right after; absent = last. */
  after?: string;
}

/** Own labels: any field. Built-ins: chip/description/rank only ("" = back to the default). */
export interface RoleLabelPatch {
  name?: string;
  chip?: string;
  description?: string;
  rank?: number;
}

/** An alias (as written → exercise) with its exercise's name; global ones are read-only. */
export type AliasDto = VocabularyAlias;

/** A glossary term in the trainer's effective glossary; global ones are read-only. */
export type GlossaryTermDto = GlossaryTerm;

export interface GlossaryTermPatch {
  term?: string;
  meaning?: string;
  kind?: GlossaryKind;
}

export interface AliasInput {
  /** The name as the trainer wrote it; the API normalizes it. */
  alias: string;
  exerciseId: string;
  source: "import" | "manual";
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
  /** Pre-session sleep and soreness, 1–5 each. */
  readiness?: ReadinessDto | null;
  /** Per-exercise pain / technique / skipped flags. */
  flags?: SessionFlagDto[] | null;
  /** This program session is already logged: throw DuplicateLogError (default),
   *  swap the old log for this one, or keep both. */
  onDuplicate?: "reject" | "replace" | "add";
  sets: LogSetInput[];
}

/** The newest log of the program session a save would duplicate. */
export interface ExistingLogDto {
  id: string;
  date: string;
  setCount: number;
}

/** Thrown by `logSession` (409) when the program session is already logged
 *  and `onDuplicate` is "reject". Re-send with "replace" or "add". */
export class DuplicateLogError extends Error {
  readonly status = 409;
  constructor(readonly existing: ExistingLogDto) {
    super("already logged");
    this.name = "DuplicateLogError";
  }
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
  /** Null on logs saved before readiness existed, or with none rated. */
  readiness: ReadinessDto | null;
  /** Null on logs saved before flags existed, or with none set. */
  flags: SessionFlagDto[] | null;
  sets: {
    id?: string;
    /** The program slot the set was logged against; null = ad-hoc. */
    programExerciseId?: string | null;
    exerciseId: string;
    setNumber: number;
    type: SetType;
    weightKg?: number | null;
    reps: number;
    rpe?: number | null;
  }[];
}

/** A fresh save. `replaced` holds the logs a Replace removed, in full — Undo writes them back. */
export type SavedLogDto = SessionLogDto & { replaced: SessionLogDto[] };

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
  description: string | null;
  /** The preset key or scheme id this one was duplicated from. */
  basedOn: string | null;
  weeks: WeekPlan[];
  /** Null until first edited. */
  updatedAt: string | null;
}

export interface SchemeInput {
  name: string;
  description?: string | null;
  basedOn?: string | null;
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

export type DraftEditOpDto = DraftEditOp;

export interface DraftEditResultDto {
  generation: GenerationDto;
  message: ChatMessageDto;
  undo: DraftEditOp[];
  /** True: folded into the target version (same id, its label and note updated); false: a new version. */
  folded: boolean;
  /** Version number of `generation` (v1 = first draft). */
  version: number;
  /** This edit's own changes; the version's label accumulates every hand edit. */
  changes: string[];
}

export interface ChatMessageDto {
  id: string;
  role: "trainer" | "assistant";
  /** edit = the trainer's hand edit of a draft, shown as a system line. */
  kind: "chat" | "revision" | "draft" | "error" | "proposal" | "edit";
  content: string;
  generationId: string | null;
  /** Proposal payload for kind "proposal"; null/absent otherwise. */
  proposal?: ChatProposalDto | null;
  createdAt: string;
}

/** What a trainer verdict judges. */
export type LlmSubjectKindDto = "chat_message" | "generation" | "client_message";

/** The latest 👍/👎 on an AI output. */
export interface LlmVerdictDto {
  id: string;
  subjectKind: LlmSubjectKindDto;
  subjectId: string;
  signal: "thumbs_up" | "thumbs_down";
  reasonTags: LlmReasonTag[];
  comment: string | null;
  /** "What instead" from the 👎 tray. */
  correction?: string | null;
  scope?: NoteScope;
  createdAt: string;
}

export type NoteAnchorDto = NoteAnchor;
export type NoteScopeDto = NoteScope;

/** A note pinned to one part of an AI output. */
export interface LlmNoteDto {
  id: string;
  subjectKind: LlmSubjectKindDto;
  subjectId: string;
  anchor: NoteAnchorDto | null;
  /** Plain-text pointer ("Session 1 (Day A) · exercise #2 Back Squat"). */
  anchorText: string;
  comment: string | null;
  correction: string | null;
  scope: NoteScopeDto;
  ruleId: string | null;
  createdAt: string;
}

export interface CoachingRuleSourceDto {
  id: string;
  anchorText: string;
  comment: string | null;
  correction: string | null;
  createdAt: string;
}

/** A standing rule for every future draft. Only `active` rules reach a prompt. */
export interface CoachingRuleDto {
  id: string;
  /** null = all clients. */
  clientId: string | null;
  clientName: string | null;
  text: string;
  category: CoachingRuleCategory;
  status: CoachingRuleStatus;
  source: CoachingRuleSource;
  appliedCount: number;
  violatedCount: number;
  createdAt: string;
  updatedAt: string;
  /** The notes it was learned from (list endpoint only). */
  sources?: CoachingRuleSourceDto[];
}

/** What saving a note (or a worded 👎) returns: a proposed rule when the scope asked for one. */
export interface LearnedDto {
  rule: CoachingRuleDto | null;
  /** Extraction failed; the note itself is saved. */
  ruleError: string | null;
}

export interface NoteInput {
  subjectKind: LlmSubjectKindDto;
  subjectId: string;
  anchor: NoteAnchorDto;
  comment: string;
  correction?: string;
  scope?: NoteScopeDto;
  violatedRuleId?: string;
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
  createScheme(input: SchemeInput): Promise<PeriodizationSchemeDto>;
  updateScheme(id: string, input: SchemeInput): Promise<PeriodizationSchemeDto>;
  deleteScheme(id: string): Promise<void>;
  /** Keys of the built-in presets (SCHEME_PRESETS) the trainer has hidden. */
  hiddenSchemePresets(): Promise<string[]>;
  /** Hide or show a built-in preset; returns the hidden keys after the change. */
  setSchemePresetHidden(key: string, hidden: boolean): Promise<string[]>;
  /** Seeds the 6 defaults on a trainer's first read. */
  sessionTypes(): Promise<SessionTypeDto[]>;
  createSessionType(input: SessionTypeInput): Promise<SessionTypeDto>;
  patchSessionType(id: string, input: SessionTypePatch): Promise<SessionTypeDto>;
  /** Unused types only, never the last one; everything else archives via patchSessionType. */
  deleteSessionType(id: string): Promise<void>;
  clients(): Promise<ClientDto[]>;
  /** One page of the client roster (server-paged): search, status, sort, page, limit. */
  roster(query: RosterQuery): Promise<RosterPageDto>;
  client(id: string): Promise<{ client: ClientDto; currentProgram: ProgramDto | null; programs: ProgramDto[] }>;
  createClient(input: Omit<ClientDto, "id" | "status">): Promise<ClientDto>;
  updateClient(id: string, patch: Partial<ClientDto>): Promise<ClientDto>;
  /** The generate page's last Weeks choice ("same" until the trainer picks). */
  weeksChoice(): Promise<WeeksChoice>;
  setWeeksChoice(choice: WeeksChoice): Promise<WeeksChoice>;
  /** The trainer's deload rule, filled with the default when unset. */
  deloadSettings(): Promise<DeloadSettings>;
  setDeloadSettings(settings: DeloadSettings): Promise<DeloadSettings>;
  /** Back to the built-in default; resolves to it. */
  resetDeloadSettings(): Promise<DeloadSettings>;
  /** Give one client their own deload rule. */
  setClientDeload(id: string, settings: DeloadSettings): Promise<ClientDto>;
  /** The client follows the trainer's rule again. */
  resetClientDeload(id: string): Promise<ClientDto>;

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
  /** A client's logs, newest first; `programId` keeps one program's, `from` (YYYY-MM-DD)
   *  drops older ones, `limit` caps the count (1–1000, default 200). */
  sessionLogs(clientId: string, programId?: string, opts?: { from?: string; limit?: number }): Promise<SessionLogDto[]>;
  /** Throws DuplicateLogError when the session is already logged and `onDuplicate` is "reject". */
  logSession(input: SessionLogInput): Promise<SavedLogDto>;
  /** Undo a save: the log and its sets go. */
  deleteSessionLog(id: string): Promise<void>;

  generate(input: {
    clientId: string;
    basedOnProgramId?: string | null;
    targetWeek?: number;
    /** Block drafts: weeks in the block (the trainer's field wins over the AI's plan). */
    plannedWeeks?: number;
    /** Block drafts: odd weeks A, even weeks B. */
    alternate?: boolean;
    direction?: string;
    providerId?: string;
    model?: string;
    effort?: string;
    instructions?: string;
  }): Promise<GenerationDto>;
  /**
   * Fill with AI: the AI writes every week of `programId` after the last
   * logged week (and after the first week of each letter); those stay locked.
   */
  fillProgram(input: {
    clientId: string;
    programId: string;
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
  /**
   * Hand edit (move, superset, move to session, undo) → the next draft version
   * plus its chat note; `undo` is the op list that puts this version's parent back.
   */
  editDraft(generationId: string, ops: DraftEditOp[]): Promise<DraftEditResultDto>;
  approveGeneration(id: string): Promise<ProgramDto>;
  rejectGeneration(id: string, reason?: string): Promise<GenerationDto>;
  cancelGeneration(id: string): Promise<GenerationDto>;

  /** Paste notes: read the text (blocks until settled — poll `importRow` if the connection drops). */
  createImport(input: { clientId: string; text: string; providerId?: string; model?: string; effort?: string }): Promise<ImportDto>;
  importRow(id: string): Promise<ImportDto>;
  /** The client's 5 most recent imports, newest first. */
  imports(clientId: string): Promise<ImportSummaryDto[]>;
  cancelImport(id: string): Promise<ImportDto>;
  /** Save the import's logged numbers as archived programs + logs (409 once saved). */
  saveImportHistory(id: string, input: ImportHistoryInput): Promise<ImportHistorySavedDto>;
  /** Undo a history save: its programs and their logs are deleted. */
  undoImportHistory(id: string): Promise<{ removed: number }>;
  /** Save personal aliases (as written → exercise) from confirmed matches. */
  saveAliases(items: AliasInput[]): Promise<void>;
  /** Personal aliases first, then the global ones. */
  aliases(): Promise<AliasDto[]>;
  /** Point a personal alias at another exercise. */
  patchAlias(id: string, exerciseId: string): Promise<AliasDto>;
  deleteAlias(id: string): Promise<void>;
  /** The effective glossary: personal terms, then global ones not overridden. */
  glossary(): Promise<GlossaryTermDto[]>;
  createGlossaryTerm(input: GlossaryTermInput): Promise<GlossaryTermDto>;
  patchGlossaryTerm(id: string, patch: GlossaryTermPatch): Promise<GlossaryTermDto>;
  deleteGlossaryTerm(id: string): Promise<void>;
  /** Built-ins + the trainer's own labels, by rank (archived flagged). */
  roleLabels(): Promise<RoleLabelDto[]>;
  createRoleLabel(input: RoleLabelInput): Promise<RoleLabelDto>;
  /** `idOrKey`: an own label's id, or a built-in key. */
  patchRoleLabel(idOrKey: string, patch: RoleLabelPatch): Promise<RoleLabelDto>;
  /** Own labels only: out of the picker; programs still show it. */
  archiveRoleLabel(id: string): Promise<RoleLabelDto>;

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

  /** 👍/👎 on an AI output, with optional reason chips and a comment. Latest verdict wins. */
  rateLlmOutput(input: {
    subjectKind: LlmSubjectKindDto;
    subjectId: string;
    signal: "thumbs_up" | "thumbs_down";
    reasonTags?: LlmReasonTag[];
    comment?: string;
    correction?: string;
    scope?: NoteScopeDto;
    violatedRuleId?: string;
  }): Promise<LlmVerdictDto & Partial<LearnedDto>>;
  /** Take the 👍/👎 on an AI output back. */
  clearLlmVerdict(subjectKind: LlmSubjectKindDto, subjectId: string): Promise<void>;
  /** Latest verdict per subject (subjects without one are absent). */
  llmVerdicts(subjectIds: string[]): Promise<LlmVerdictDto[]>;
  /** UI-side implicit signals: Adjust on a proposal, Copy on a client message. */
  recordLlmSignal(input: {
    subjectKind: LlmSubjectKindDto;
    subjectId: string;
    signal: "proposal_adjusted" | "client_message_copied";
  }): Promise<void>;

  /** Pin a note to part of an output. Scope client/always proposes a rule (never active until confirmed). */
  addNote(input: NoteInput): Promise<{ note: LlmNoteDto } & LearnedDto>;
  /** Notes on these subjects, oldest first. */
  llmNotes(subjectIds: string[]): Promise<LlmNoteDto[]>;
  /** "Apply to this draft": revise the noted draft with the note as the request. */
  applyNote(noteId: string): Promise<GenerationDto>;

  coachingRules(): Promise<CoachingRuleDto[]>;
  /** A hand-written rule — active at once. */
  createCoachingRule(input: { text: string; category?: CoachingRuleCategory; clientId?: string | null }): Promise<CoachingRuleDto>;
  updateCoachingRule(
    id: string,
    patch: { text?: string; category?: CoachingRuleCategory; clientId?: string | null; status?: "active" | "retired" }
  ): Promise<CoachingRuleDto>;
  /** "Keep for: this client / always" on a proposed rule. */
  confirmCoachingRule(id: string, input: { scope: "client" | "always"; clientId?: string; text?: string }): Promise<CoachingRuleDto>;
  dismissCoachingRule(id: string): Promise<CoachingRuleDto>;
  deleteCoachingRule(id: string): Promise<void>;
  /** "Remember this for next time?" after a chat-built revision. */
  extractChatRule(input: { generationId: string; scope?: "client" | "always" }): Promise<CoachingRuleDto>;
}
