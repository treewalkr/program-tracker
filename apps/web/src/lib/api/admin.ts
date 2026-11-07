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
  async removeTrainer(id: string): Promise<void> {
    const { error } = await client.v1.admin.trainers({ id }).delete();
    if (error) throw new Error(message(error));
  },
};
