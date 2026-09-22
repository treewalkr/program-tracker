import { PUBLIC_API_URL } from "$env/static/public";

const BASE = PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `request failed: ${res.status}`, body);
  }
  return body as T;
}

export interface ProviderInfo {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  configured: boolean;
}

export interface ClientDto {
  id: string;
  trainerId: string;
  name: string;
  email: string;
  status: string;
  goals: string | null;
  limitations: string | null;
  daysPerWeek: number | null;
}

export interface PrescribedSetDto {
  setNumber: number;
  type: string;
  reps: number;
  amrap: boolean;
  targetRpe?: number;
  restSeconds?: number;
}

export interface ProgramDto {
  id: string;
  trainerId: string;
  clientId: string | null;
  name: string;
  description: string | null;
  status: string;
  version: number;
  aiAssisted: boolean;
  createdFromProgramId: string | null;
  sessions: {
    id: string;
    name: string;
    order: number;
    exercises: {
      id: string;
      exerciseId: string;
      order: number;
      prescribedSets: PrescribedSetDto[];
      notes?: string;
    }[];
    notes?: string;
  }[];
}

export const api = {
  health: () => request<{ ok: boolean; service: string; time: string }>("/health"),
  providers: () => request<{ providers: ProviderInfo[] }>("/v1/ai/providers"),
  clients: () => request<ClientDto[]>("/v1/clients"),
  programs: (clientId?: string) =>
    request<ProgramDto[]>(`/v1/programs${clientId ? `?clientId=${clientId}` : ""}`),
};
