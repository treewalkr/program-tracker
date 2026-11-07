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
  async removeTrainer(id: string): Promise<void> {
    const { error } = await client.v1.admin.trainers({ id }).delete();
    if (error) throw new Error(message(error));
  },
};
