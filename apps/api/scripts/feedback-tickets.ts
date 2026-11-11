/**
 * Ticket comments by number from the live API, for `changelog:draft` (which
 * lives at the repo root, outside this package's dependencies).
 */
import { treaty } from "@elysiajs/eden";
import type { App } from "../src/app";
import { agentEnv } from "./agent-env";

/** number → comment, or a reason the tickets couldn't be read. */
export async function ticketComments(numbers: number[]): Promise<Map<number, string> | { skipped: string }> {
  const env = agentEnv();
  if (!env) return { skipped: "no PT_API_URL / FEEDBACK_AGENT_TOKEN (.env.agent)" };
  const api = treaty<App>(env.url, { headers: { authorization: `Bearer ${env.token}` } }).v1.agent.feedback;
  const res = await api.tickets.get({ query: { numbers: numbers.join(",") } }).catch((e: unknown) => ({
    data: null,
    error: { status: e instanceof Error ? e.message : String(e) },
  }));
  if (!res.data) return { skipped: `couldn't read them from ${env.url} (${String(res.error?.status)})` };
  return new Map(res.data.map((t) => [t.number, t.comment]));
}
