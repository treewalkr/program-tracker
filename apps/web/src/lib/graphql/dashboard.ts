import { browser } from "$app/environment";
import { normalizeKinds } from "@pt/shared";
import { apiBase } from "$lib/api/base";
import { toLogin } from "$lib/api/auth";
import { capturingFetch } from "$lib/feedback/runtime";
import { graphql, type ResultOf } from "./graphql";

/** The home dashboard — only the fields the page and `buildClientStrip` read. */
const DASHBOARD = `
  query Dashboard {
    dashboard {
      client { id name status sessionsPerWeek cardioTarget createdAt }
      currentProgram { id clientId name status weeks activatedAt startsOn createdAt }
      logs { id programId programSessionId date kind cardio sets { exerciseId type weightKg reps } }
      portalLink
    }
  }
`;
export const DashboardQuery = graphql(DASHBOARD);

export type DashboardRow = ResultOf<typeof DashboardQuery>["dashboard"][number];

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string }[];
}

/** Like Eden in treaty.ts: same-origin in the browser (cookies ride along), recorded for feedback. */
const send = browser ? capturingFetch(() => fetch) : fetch;

/**
 * GET /v1/graphql?query=… — the API takes GET only, so a read-only "view as
 * trainer" works. A 401 goes back to sign-in and GraphQL `errors` throw, as
 * `unwrap` does for Eden.
 */
export async function fetchDashboard(): Promise<DashboardRow[]> {
  const res = await send(`${apiBase}/v1/graphql?query=${encodeURIComponent(DASHBOARD)}`, {
    headers: { accept: "application/graphql-response+json, application/json" },
    credentials: "include",
  });
  if (res.status === 401 && browser) window.location.assign(toLogin(new URL(window.location.href)));
  const body = (await res.json().catch(() => ({}))) as GraphQLResponse<ResultOf<typeof DashboardQuery>>;
  const message = body.errors?.[0]?.message;
  if (!res.ok || message || !body.data) {
    throw Object.assign(new Error(message ?? `request failed: ${res.status}`), { status: res.status });
  }
  // REST reads kinds through the alias in trainerWire; the GraphQL path does the same.
  return normalizeKinds(body.data.dashboard);
}
