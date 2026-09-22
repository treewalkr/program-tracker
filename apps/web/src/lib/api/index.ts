import { mockApi } from "./mock/api";
import { realApi } from "./real";
import type { TrainerApi } from "./types";

/**
 * PUBLIC_API_MODE=mock (default) — in-memory demo data, no backend needed.
 * PUBLIC_API_MODE=live — talk to the Elysia API (PUBLIC_API_URL).
 */
export const apiMode: "mock" | "live" =
  (import.meta.env.PUBLIC_API_MODE as string) === "live" ? "live" : "mock";

export const api: TrainerApi = apiMode === "live" ? realApi : mockApi;
export type { TrainerApi } from "./types";
