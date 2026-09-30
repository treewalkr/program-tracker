import type {
  ClientDto,
  ExerciseDto,
  GenerationDto,
  HistoryEntryDto,
  ProgramDto,
  ProviderDto,
  SessionLogDto,
  SessionLogInput,
  InstructionTemplateDto,
  PeriodizationSchemeDto,
  SignalDto,
  TrainerApi,
} from "./types";
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
    const value = error.value as { error?: string } | string | null;
    const message = typeof value === "string" ? value : value?.error;
    const code = typeof error.status === "number" ? error.status : "unknown";
    throw new Error(message ?? `request failed: ${code}`);
  }
  return datesToIso(data) as T;
}

/** Wire-up against the running Elysia API via Eden Treaty. Enabled via PUBLIC_API_MODE=live. */
export const realApi: TrainerApi = {
  providers: async () =>
    (await unwrap<{ providers: ProviderDto[] }>(client.v1.ai.providers.get())).providers,
  clients: () => unwrap<ClientDto[]>(client.v1.clients.get()),
  client: (id) =>
    unwrap<{ client: ClientDto; currentProgram: ProgramDto | null; programs: ProgramDto[] }>(
      client.v1.clients({ id }).get()
    ),
  createClient: (input) => unwrap<ClientDto>(client.v1.clients.post(input)),
  updateClient: (id, patch) => unwrap<ClientDto>(client.v1.clients({ id }).patch(patch)),

  program: (id) => unwrap<ProgramDto>(client.v1.programs({ id }).get()),
  programs: (clientId) => unwrap<ProgramDto[]>(client.v1.programs.get({ query: { clientId } })),
  saveProgram: (id, sessions) =>
    unwrap<ProgramDto>(client.v1.programs({ id }).put({ sessions })),
  createProgram: (input) => unwrap<ProgramDto>(client.v1.programs.post(input)),
  setProgramStatus: (id, status) =>
    unwrap<ProgramDto>(client.v1.programs({ id }).status.patch({ status })),

  exercises: (q) => unwrap<ExerciseDto[]>(client.v1.exercises.get({ query: q ? { q } : {} })),
  createExercise: (input) => unwrap<ExerciseDto>(client.v1.exercises.post(input)),

  history: async (clientId) =>
    (await unwrap<{ history: HistoryEntryDto[] }>(client.v1.logs.history.get({ query: { clientId } }))).history,
  sessionLogs: (clientId) =>
    unwrap<SessionLogDto[]>(client.v1.logs.sessions.get({ query: { clientId } })),
  logSession: (input: SessionLogInput) => unwrap<unknown>(client.v1.logs.sessions.post(input)),

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
  deleteScheme: (id) => unwrap<void>(client.v1.schemes({ id }).delete()),

  notifications: async () =>
    (await unwrap<{ signals: SignalDto[] }>(client.v1.notifications.get())).signals,
  snoozeSignal: (id, until) =>
    unwrap<void>(client.v1.notifications({ signalId: id }).snooze.put({ until })),

  generate: (input) => unwrap<GenerationDto>(client.v1.ai.generate.post(input)),
  generations: (clientId) =>
    unwrap<GenerationDto[]>(client.v1.ai.generations.get({ query: { clientId } })),
  approveGeneration: (id) => unwrap<ProgramDto>(client.v1.ai.generations({ id }).approve.post()),
  rejectGeneration: (id) => unwrap<GenerationDto>(client.v1.ai.generations({ id }).reject.post()),
};
