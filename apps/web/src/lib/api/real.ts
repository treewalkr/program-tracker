import type {
  AliasDto,
  ChainWeekDto,
  ChatMessageDto,
  ClientMessageDto,
  ClientDto,
  ExerciseDto,
  GenerationDto,
  DraftEditResultDto,
  GlossaryTermDto,
  HistoryEntryDto,
  ImportDto,
  ImportHistorySavedDto,
  ImportSummaryDto,
  InstructionTemplateDto,
  LlmVerdictDto,
  LlmNoteDto,
  CoachingRuleDto,
  LearnedDto,
  KineticChainDto,
  PeriodizationSchemeDto,
  PreferencesDto,
  ProgramDto,
  ProgramExampleDto,
  ProviderDto,
  RosterPageDto,
  RoleLabelDto,
  SavedLogDto,
  SessionLogDto,
  SessionLogInput,
  SessionTypeDto,
  SignalDto,
  TrainerApi,
  ExistingLogDto,
} from "./types";
import { DuplicateLogError } from "./types";
import type { DeloadSettings, WeeksChoice } from "@pt/shared";
import { browser } from "$app/environment";
import { toLogin } from "./auth";
import { client } from "./treaty";

/**
 * Eden result → thrown Error, preserving the API's `error` message envelope.
 * `data` is `unknown` and each call site names its wire type. Eden revives ISO
 * date strings into Date objects; the DTOs model dates as ISO strings, so we
 * deep-convert back — pages then see identical shapes in mock and live modes.
 */
function datesToIso(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(datesToIso);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, datesToIso(v)])
    );
  }
  return value;
}

async function unwrap<T>(
  p: Promise<{ data: unknown; error: { value: unknown; status?: unknown } | null }>
): Promise<T> {
  const { data, error } = await p;
  if (error) {
    const value = error.value as { error?: string; issues?: unknown } | string | null;
    const message = typeof value === "string" ? value : value?.error;
    const code = typeof error.status === "number" ? error.status : "unknown";
    // session expired mid-use — back to sign-in, then here again
    if (code === 401 && browser) window.location.assign(toLogin(new URL(window.location.href)));
    // validation detail rides along so forms can point at the offending field
    const issues = typeof value === "object" && value ? value.issues : undefined;
    // a 409 duplicate log names the log it collides with
    const existing = typeof value === "object" && value && "existing" in value ? value.existing : undefined;
    throw Object.assign(new Error(message ?? `request failed: ${code}`), { status: code, issues, existing });
  }
  return datesToIso(data) as T;
}

/** Wire-up against the running Elysia API via Eden Treaty. Enabled via PUBLIC_API_MODE=live. */
export const realApi: TrainerApi = {
  apiBuild: async () => (await unwrap<{ build: string }>(client.v1.meta.get())).build,
  providers: async () =>
    (await unwrap<{ providers: ProviderDto[] }>(client.v1.ai.providers.get())).providers,
  clients: () => unwrap<ClientDto[]>(client.v1.clients.get()),
  roster: async (query) => {
    const page = await unwrap<RosterPageDto>(client.v1.clients.roster.get({ query }));
    // Eden revives the calendar day into a Date; hand pages the YYYY-MM-DD the API sent.
    return { ...page, items: page.items.map((c) => ({ ...c, lastSessionAt: c.lastSessionAt?.slice(0, 10) ?? null })) };
  },
  client: (id) =>
    unwrap<{ client: ClientDto; currentProgram: ProgramDto | null; programs: ProgramDto[] }>(
      client.v1.clients({ id }).get()
    ),
  createClient: (input) => unwrap<ClientDto>(client.v1.clients.post(input)),
  updateClient: (id, patch) => unwrap<ClientDto>(client.v1.clients({ id }).patch(patch)),
  weeksChoice: async () => (await unwrap<{ choice: WeeksChoice }>(client.v1.account["weeks-choice"].get())).choice,
  setWeeksChoice: async (choice) => (await unwrap<{ choice: WeeksChoice }>(client.v1.account["weeks-choice"].put({ choice }))).choice,
  deloadSettings: () => unwrap<DeloadSettings>(client.v1.account.deload.get()),
  setDeloadSettings: (settings) => unwrap<DeloadSettings>(client.v1.account.deload.put(settings)),
  resetDeloadSettings: () => unwrap<DeloadSettings>(client.v1.account.deload.delete()),
  setClientDeload: (id, settings) => unwrap<ClientDto>(client.v1.clients({ id }).deload.put(settings)),
  resetClientDeload: (id) => unwrap<ClientDto>(client.v1.clients({ id }).deload.delete()),

  program: (id) => unwrap<ProgramDto>(client.v1.programs({ id }).get()),
  programs: (clientId) => unwrap<ProgramDto[]>(client.v1.programs.get({ query: { clientId } })),
  saveProgram: (id, weeks, phasing) =>
    unwrap<ProgramDto>(
      client.v1.programs({ id }).put(phasing === undefined ? { weeks } : { weeks, phasing })
    ),
  createProgram: (input) =>
    unwrap<ProgramDto>(
      client.v1.programs.post({
        ...input,
        createdFromProgramId: input.createdFromProgramId ?? undefined,
      })
    ),
  setProgramStatus: (id, status) =>
    unwrap<ProgramDto>(client.v1.programs({ id }).status.patch({ status })),
  saveProgramDirection: (id, direction) =>
    unwrap<ProgramDto>(client.v1.programs({ id }).direction.patch({ direction })),

  examples: async (programId) =>
    (
      await unwrap<{ examples: ProgramExampleDto[]}>(
        client.v1.examples.get({ query: programId ? { programId } : {} })
      )
    ).examples,
  createExample: (input) => unwrap<ProgramExampleDto>(client.v1.examples.post(input)),
  updateExample: (id, patch) => unwrap<ProgramExampleDto>(client.v1.examples({ id }).patch(patch)),
  deleteExample: (id) => unwrap<void>(client.v1.examples({ id }).delete()),

  exercises: (q) => unwrap<ExerciseDto[]>(client.v1.exercises.get({ query: q ? { q } : {} })),
  createExercise: (input) => unwrap<ExerciseDto>(client.v1.exercises.post(input)),
  patchExercise: (id, input) => unwrap<ExerciseDto>(client.v1.exercises({ id }).patch(input)),
  deleteExercise: (id) => unwrap<void>(client.v1.exercises({ id }).delete()),

  sessionTypes: () => unwrap<SessionTypeDto[]>(client.v1["session-types"].get()),
  createSessionType: (input) => unwrap<SessionTypeDto>(client.v1["session-types"].post(input)),
  patchSessionType: (id, input) => unwrap<SessionTypeDto>(client.v1["session-types"]({ id }).patch(input)),
  deleteSessionType: (id) => unwrap<void>(client.v1["session-types"]({ id }).delete()),

  history: async (clientId) =>
    (await unwrap<{ history: HistoryEntryDto[] }>(client.v1.logs.history.get({ query: { clientId } }))).history,
  sessionLogs: (clientId, programId, opts) =>
    unwrap<SessionLogDto[]>(
      client.v1.logs.sessions.get({
        query: {
          clientId,
          ...(programId ? { programId } : {}),
          ...(opts?.from ? { from: opts.from } : {}),
          ...(opts?.limit ? { limit: opts.limit } : {}),
        },
      }),
    ),
  logSession: async (input: SessionLogInput) => {
    try {
      return await unwrap<SavedLogDto>(client.v1.logs.sessions.post(input));
    } catch (err) {
      const e = err as Error & { status?: unknown; existing?: ExistingLogDto };
      if (e.status === 409 && e.existing) throw new DuplicateLogError(e.existing);
      throw err;
    }
  },
  deleteSessionLog: (id) => unwrap<void>(client.v1.logs.sessions({ id }).delete()),

  instructionTemplates: async () =>
    (await unwrap<{ templates: InstructionTemplateDto[] }>(client.v1.ai["prompt-templates"].get())).templates,
  createInstructionTemplate: (input) =>
    unwrap<InstructionTemplateDto>(client.v1.ai["prompt-templates"].post(input)),
  updateInstructionTemplate: (id, input) =>
    unwrap<InstructionTemplateDto>(client.v1.ai["prompt-templates"]({ id }).put(input)),
  deleteInstructionTemplate: (id) =>
    unwrap<void>(client.v1.ai["prompt-templates"]({ id }).delete()),

  schemes: async () =>
    (await unwrap<{ schemes: PeriodizationSchemeDto[] }>(client.v1.schemes.get())).schemes,
  createScheme: (input) => unwrap<PeriodizationSchemeDto>(client.v1.schemes.post(input)),
  updateScheme: (id, input) => unwrap<PeriodizationSchemeDto>(client.v1.schemes({ id }).put(input)),
  deleteScheme: (id) => unwrap<void>(client.v1.schemes({ id }).delete()),
  hiddenSchemePresets: async () =>
    (await unwrap<{ hidden: string[] }>(client.v1.schemes.presets.hidden.get())).hidden,
  setSchemePresetHidden: async (key, hidden) =>
    (await unwrap<{ hidden: string[] }>(client.v1.schemes.presets({ key }).put({ hidden }))).hidden,

  notifications: async () =>
    (await unwrap<{ signals: SignalDto[] }>(client.v1.notifications.get())).signals,
  snoozeSignal: (id, until) =>
    unwrap<void>(client.v1.notifications({ signalId: id }).snooze.put({ until })),

  generate: (input) => unwrap<GenerationDto>(client.v1.ai.generate.post(input)),
  generations: (clientId) =>
    unwrap<GenerationDto[]>(client.v1.ai.generations.get({ query: { clientId } })),
  generation: (id) => unwrap<GenerationDto>(client.v1.ai.generations({ id }).get()),
  savePhasing: (generationId, phasing) =>
    unwrap<GenerationDto>(client.v1.ai.generations({ id: generationId }).phasing.post({ phasing })),
  editDraft: (generationId, ops) =>
    unwrap<DraftEditResultDto>(client.v1.ai.generations({ id: generationId }).edit.post({ ops })),
  reviseGeneration: (id, message) =>
    unwrap<GenerationDto>(client.v1.ai.generations({ id }).revise.post({ message })),
  approveGeneration: (id) => unwrap<ProgramDto>(client.v1.ai.generations({ id }).approve.post()),
  rejectGeneration: (id, reason) =>
    unwrap<GenerationDto>(
      client.v1.ai.generations({ id }).reject.post(reason ? { reason } : {})
    ),
  cancelGeneration: (id) =>
    unwrap<GenerationDto>(client.v1.ai.generations({ id }).cancel.post()),

  createImport: (input) => unwrap<ImportDto>(client.v1.ai.imports.post(input)),
  importRow: (id) => unwrap<ImportDto>(client.v1.ai.imports({ id }).get()),
  imports: (clientId) => unwrap<ImportSummaryDto[]>(client.v1.ai.imports.get({ query: { clientId } })),
  cancelImport: (id) => unwrap<ImportDto>(client.v1.ai.imports({ id }).cancel.post()),
  saveImportHistory: (id, input) => unwrap<ImportHistorySavedDto>(client.v1.ai.imports({ id }).history.post(input)),
  undoImportHistory: (id) => unwrap<{ removed: number }>(client.v1.ai.imports({ id }).history.delete()),
  saveAliases: async (items) => {
    await unwrap<unknown>(client.v1.vocabulary.aliases.post({ items }));
  },
  aliases: () => unwrap<AliasDto[]>(client.v1.vocabulary.aliases.get()),
  patchAlias: (id, exerciseId) => unwrap<AliasDto>(client.v1.vocabulary.aliases({ id }).patch({ exerciseId })),
  deleteAlias: async (id) => {
    await unwrap<unknown>(client.v1.vocabulary.aliases({ id }).delete());
  },
  glossary: () => unwrap<GlossaryTermDto[]>(client.v1.vocabulary.glossary.get()),
  createGlossaryTerm: (input) => unwrap<GlossaryTermDto>(client.v1.vocabulary.glossary.post(input)),
  patchGlossaryTerm: (id, patch) => unwrap<GlossaryTermDto>(client.v1.vocabulary.glossary({ id }).patch(patch)),
  deleteGlossaryTerm: async (id) => {
    await unwrap<unknown>(client.v1.vocabulary.glossary({ id }).delete());
  },
  roleLabels: () => unwrap<RoleLabelDto[]>(client.v1.vocabulary["role-labels"].get()),
  createRoleLabel: (input) => unwrap<RoleLabelDto>(client.v1.vocabulary["role-labels"].post(input)),
  patchRoleLabel: (idOrKey, patch) => unwrap<RoleLabelDto>(client.v1.vocabulary["role-labels"]({ id: idOrKey }).patch(patch)),
  archiveRoleLabel: (id) => unwrap<RoleLabelDto>(client.v1.vocabulary["role-labels"]({ id }).delete()),

  preferences: async () =>
    (
      await unwrap<{ preferences: PreferencesDto[] }>(
        client.v1.ai.preferences.get()
      )
    ).preferences,
  distillPreferences: (input) =>
    unwrap<PreferencesDto>(client.v1.ai.preferences.distill.post(input)),
  deletePreference: (id) =>
    unwrap<void>(client.v1.ai.preferences({ id }).delete()),

  generateClientMessage: (input) =>
    unwrap<ClientMessageDto>(client.v1["client-messages"].generate.post(input)),
  clientMessages: (clientId) =>
    unwrap<ClientMessageDto[]>(client.v1["client-messages"].get({ query: { clientId } })),
  clientMessage: (id) => unwrap<ClientMessageDto>(client.v1["client-messages"]({ id }).get()),
  approveClientMessage: (id, text) =>
    unwrap<ClientMessageDto>(
      client.v1["client-messages"]({ id }).approve.post(text !== undefined ? { text } : {})
    ),
  rejectClientMessage: (id) =>
    unwrap<ClientMessageDto>(client.v1["client-messages"]({ id }).reject.post()),

  chains: async () => {
    const res = await unwrap<{
      chains: (KineticChainDto & {
        trainerId?: string;
        createdAt?: string;
        updatedAt?: string;
      })[];
    }>(client.v1.chains.get());
    return res.chains.map((c) => ({
      id: c.id,
      name: c.name,
      muscleGroups: c.muscleGroups,
      sortOrder: c.sortOrder,
    }));
  },
  updateChain: async (id, input) => {
    const row = await unwrap<
      KineticChainDto & {
        trainerId?: string;
        createdAt?: string;
        updatedAt?: string;
      }
    >(client.v1.chains({ id }).put(input));
    return {
      id: row.id,
      name: row.name,
      muscleGroups: row.muscleGroups,
      sortOrder: row.sortOrder,
    };
  },
  chainWeek: (clientId) =>
    unwrap<ChainWeekDto>(client.v1.chains.week.get({ query: { clientId } })),

  chatMessages: async (clientId) =>
    (await unwrap<{ messages: ChatMessageDto[] }>(client.v1.ai.chat.get({ query: { clientId } }))).messages,
  sendChatMessage: async (input) =>
    (await unwrap<{ messages: ChatMessageDto[] }>(client.v1.ai.chat.post(input))).messages,
  chatTurn: (input) =>
    unwrap<{ messages: ChatMessageDto[]; generation: GenerationDto | null }>(client.v1.ai.chat.turn.post(input)),
  buildProposal: (messageId, opts) =>
    unwrap<{ messages: ChatMessageDto[]; generation: GenerationDto }>(
      client.v1.ai.chat.proposals({ messageId }).build.post(opts)
    ),
  clearChat: (clientId) => unwrap<void>(client.v1.ai.chat.delete(undefined, { query: { clientId } })),

  rateLlmOutput: (input) => unwrap<LlmVerdictDto & LearnedDto>(client.v1.ai.feedback.post(input)),
  clearLlmVerdict: async (subjectKind, subjectId) => {
    await unwrap<unknown>(client.v1.ai.feedback.delete(undefined, { query: { subjectKind, subjectId } }));
  },
  llmVerdicts: async (subjectIds) =>
    subjectIds.length === 0
      ? []
      : (
          await unwrap<{ verdicts: LlmVerdictDto[] }>(
            client.v1.ai.feedback.get({ query: { subjectIds: subjectIds.join(",") } })
          )
        ).verdicts,
  recordLlmSignal: async (input) => {
    await unwrap<unknown>(client.v1.ai.feedback.post(input));
  },

  addNote: (input) => unwrap<{ note: LlmNoteDto } & LearnedDto>(client.v1.ai.feedback.notes.post(input)),
  llmNotes: async (subjectIds) =>
    subjectIds.length === 0
      ? []
      : (
          await unwrap<{ notes: LlmNoteDto[] }>(
            client.v1.ai.feedback.notes.get({ query: { subjectIds: subjectIds.join(",") } })
          )
        ).notes,
  applyNote: (noteId) => unwrap<GenerationDto>(client.v1.ai.feedback.notes({ id: noteId }).apply.post()),

  coachingRules: async () => (await unwrap<{ rules: CoachingRuleDto[] }>(client.v1.ai.rules.get())).rules,
  createCoachingRule: (input) => unwrap<CoachingRuleDto>(client.v1.ai.rules.post(input)),
  updateCoachingRule: (id, patch) => unwrap<CoachingRuleDto>(client.v1.ai.rules({ id }).patch(patch)),
  confirmCoachingRule: (id, input) => unwrap<CoachingRuleDto>(client.v1.ai.rules({ id }).confirm.post(input)),
  dismissCoachingRule: (id) => unwrap<CoachingRuleDto>(client.v1.ai.rules({ id }).dismiss.post()),
  deleteCoachingRule: async (id) => {
    await unwrap<unknown>(client.v1.ai.rules({ id }).delete());
  },
  extractChatRule: (input) => unwrap<CoachingRuleDto>(client.v1.ai.rules.extract.post(input)),
};
