import { PUBLIC_API_MODE } from "$env/static/public";
import { lazyApi } from "./lazy";
import { realApi } from "./real";
import type { TrainerApi } from "./types";

/**
 * PUBLIC_API_MODE=mock (default) — in-memory demo data, no backend needed.
 * PUBLIC_API_MODE=live — talk to the Elysia API (PUBLIC_API_URL).
 */
export const apiMode: "mock" | "live" = PUBLIC_API_MODE === "live" ? "live" : "mock";

// The demo backend loads on its first call; testing the env constant itself (not `apiMode`)
// lets a live build fold the branch away and drop the mock chunk.
export const api: TrainerApi = PUBLIC_API_MODE === "live" ? realApi : lazyApi(() => import("./mock/api").then((m) => m.mockApi));
export type { TrainerApi } from "./types";
