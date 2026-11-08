import type { ClientExperience, ClientSex, ClientStatus, ProgramWeek } from "@pt/shared";
import { client } from "./treaty";

export interface TrainerAccount {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  /** invited = added, never signed in; active = has signed in; disabled = blocked by the admin. */
  access: "invited" | "active" | "disabled";
  isAdmin: boolean;
  clientCount: number;
  createdAt: string;
  lastSignInAt: string | null;
}

/** One client in the admin's read-only directory — no contact details or client notes. */
export interface AdminClient {
  id: string;
  name: string;
  status: ClientStatus;
  experience: ClientExperience | null;
  /** YYYY-MM-DD: the trainer's "client since", else the day the client was added. */
  clientSince: string;
  /** YYYY-MM-DD of the latest logged session; null = never logged. */
  lastSessionAt: string | null;
  trainer: { id: string; name: string; access: TrainerAccount["access"] };
  /** The client's active programme; null = none active. */
  programme: AdminProgrammeRef | null;
}

/** An active programme's place in its block: `week` is clamped to `of`; `over` = past the plan. */
export interface AdminProgrammeRef {
  id: string;
  name: string;
  week: number;
  of: number;
  over: boolean;
}

/** One client, read-only: basics and this week of the active programme. Age only — never the birth date. */
export interface AdminClientDetail {
  client: {
    id: string;
    name: string;
    status: ClientStatus;
    experience: ClientExperience | null;
    age: number | null;
    sex: ClientSex | null;
    bodyweightKg: number | null;
    heightCm: number | null;
    sessionsPerWeek: number | null;
    /** ISO weekdays, 1 = Mon … 7 = Sun. */
    trainingDays: number[] | null;
    /** YYYY-MM-DD. */
    clientSince: string;
    /** YYYY-MM-DD; null = never logged. */
    lastSessionAt: string | null;
    trainer: AdminClient["trainer"];
  };
  programme:
    | (AdminProgrammeRef & {
        version: number;
        aiAssisted: boolean;
        /** YYYY-MM-DD of the first activation; null = never stamped. */
        activatedAt: string | null;
        thisWeek: ProgramWeek;
      })
    | null;
}

/** LLM dataset counts (real calls only; mock calls are counted apart). */
export interface LlmDatasetStats {
  byPurpose: { purpose: string; gold: number; silver: number; negative: number; unlabeled: number }[];
  attempts: { status: string; n: number }[];
  mockCalls: number;
  feedback: { explicit: number; implicit: number };
  pairs: number;
  tokens: { in: number; out: number };
}

/** One notification email, rendered from sample data by the live templates. */
export interface EmailPreview {
  id: string;
  group: "New tickets" | "Replies" | "Status changes";
  title: string;
  trigger: string;
  recipients: string;
  from: string;
  email: { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };
}

/** One notification email the app tried to send. Recipient address is masked; no content is kept. */
export interface SentEmail {
  id: string;
  kind: string;
  label: string;
  /** null = handed to the provider; otherwise why not. */
  error: string | null;
  sentAt: string;
  /** null when the account was removed. */
  recipient: { name: string; email: string } | null;
  feedbackNumber: number | null;
}

/** A UTC calendar day as `YYYY-MM-DD`, whether Eden revived it into a Date or left it a string. */
const calendarDay = (d: string | Date): string => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

/** The API's `{ error }` message, or a fallback. */
const message = (error: { status: unknown; value: unknown }) =>
  (error.value as { error?: string } | null)?.error ?? `request failed (${String(error.status)})`;

/** Platform admin console over Eden — live API only. */
export const adminApi = {
  async trainers(): Promise<TrainerAccount[]> {
    const { data, error } = await client.v1.admin.trainers.get();
    if (error) throw new Error(message(error));
    return data.trainers;
  },
  async addTrainer(body: { name: string; email: string }): Promise<TrainerAccount> {
    const { data, error } = await client.v1.admin.trainers.post(body);
    if (error) throw new Error(message(error));
    return data;
  },
  async updateTrainer(id: string, body: { name?: string; disabled?: boolean }): Promise<TrainerAccount> {
    const { data, error } = await client.v1.admin.trainers({ id }).patch(body);
    if (error) throw new Error(message(error));
    return data;
  },
  async clients(): Promise<AdminClient[]> {
    const { data, error } = await client.v1.admin.clients.get();
    if (error) throw new Error(message(error));
    // Eden revives YYYY-MM-DD strings into Dates; these are calendar days.
    return data.clients.map((c) => ({
      ...c,
      clientSince: calendarDay(c.clientSince),
      lastSessionAt: c.lastSessionAt == null ? null : calendarDay(c.lastSessionAt),
    }));
  },
  /** null = no such client. */
  async client(id: string): Promise<AdminClientDetail | null> {
    const { data, error } = await client.v1.admin.clients({ id }).get();
    if (error) {
      if (error.status === 404) return null;
      throw new Error(message(error));
    }
    const { client: c, programme: p } = data;
    return {
      client: {
        ...c,
        clientSince: calendarDay(c.clientSince),
        lastSessionAt: c.lastSessionAt == null ? null : calendarDay(c.lastSessionAt),
      },
      programme: p && { ...p, activatedAt: p.activatedAt == null ? null : calendarDay(p.activatedAt) },
    };
  },
  async llmStats(): Promise<LlmDatasetStats> {
    const { data, error } = await client.v1.admin["llm-stats"].get();
    if (error) throw new Error(message(error));
    return data;
  },
  async emails(): Promise<EmailPreview[]> {
    const { data, error } = await client.v1.admin.emails.get();
    if (error) throw new Error(message(error));
    return data.emails;
  },
  async sentEmails(): Promise<SentEmail[]> {
    const { data, error } = await client.v1.admin["email-log"].get({ query: {} });
    if (error) throw new Error(message(error));
    return data.sends;
  },
  async removeTrainer(id: string): Promise<void> {
    const { error } = await client.v1.admin.trainers({ id }).delete();
    if (error) throw new Error(message(error));
  },
};
