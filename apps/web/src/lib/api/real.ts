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
  TrainerApi,
} from "./types";
import { PUBLIC_API_URL } from "$env/static/public";

const BASE = PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as any)?.error ?? `request failed: ${res.status}`);
  return body as T;
}

/** Wire-up against the running Elysia API. Enabled via PUBLIC_API_MODE=live. */
export const realApi: TrainerApi = {
  providers: async () => (await request<{ providers: ProviderDto[] }>("/v1/ai/providers")).providers,
  clients: () => request<ClientDto[]>("/v1/clients"),
  client: (id) =>
    request<{ client: ClientDto; currentProgram: ProgramDto | null; programs: ProgramDto[] }>(
      `/v1/clients/${id}`
    ).then((r) => ({ client: r.client, currentProgram: r.currentProgram, programs: r.programs })),
  createClient: (input) =>
    request<ClientDto>("/v1/clients", { method: "POST", body: JSON.stringify(input) }),
  updateClient: (id, patch) =>
    request<ClientDto>(`/v1/clients/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  program: (id) => request<ProgramDto>(`/v1/programs/${id}`),
  programs: (clientId) => request<ProgramDto[]>(`/v1/programs?clientId=${clientId}`),
  saveProgram: (id, sessions) =>
    request<ProgramDto>(`/v1/programs/${id}`, { method: "PUT", body: JSON.stringify({ sessions }) }),
  setProgramStatus: (id, status) =>
    request<ProgramDto>(`/v1/programs/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  exercises: (q) => request<ExerciseDto[]>(`/v1/exercises${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createExercise: (input) =>
    request<ExerciseDto>("/v1/exercises", { method: "POST", body: JSON.stringify(input) }),

  history: (clientId) =>
    request<{ history: HistoryEntryDto[] }>(`/v1/logs/history?clientId=${clientId}`).then(
      (r) => r.history
    ),
  sessionLogs: (clientId) =>
    request<SessionLogDto[]>(`/v1/logs/sessions?clientId=${clientId}`),
  logSession: (input: SessionLogInput) =>
    request("/v1/logs/sessions", { method: "POST", body: JSON.stringify(input) }),

  instructionTemplates: async () =>
    (await request<{ templates: InstructionTemplateDto[] }>("/v1/ai/prompt-templates")).templates,
  createInstructionTemplate: (input) =>
    request<InstructionTemplateDto>("/v1/ai/prompt-templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteInstructionTemplate: (id) =>
    request<void>(`/v1/ai/prompt-templates/${id}`, { method: "DELETE" }),
  generate: (input) =>
    request<GenerationDto>("/v1/ai/generate", { method: "POST", body: JSON.stringify(input) }),
  generations: (clientId) =>
    request<GenerationDto[]>(`/v1/ai/generations?clientId=${clientId}`),
  approveGeneration: (id) =>
    request<ProgramDto>(`/v1/ai/generations/${id}/approve`, { method: "POST", body: "{}" }),
  rejectGeneration: (id) =>
    request<GenerationDto>(`/v1/ai/generations/${id}/reject`, { method: "POST", body: "{}" }),
};
