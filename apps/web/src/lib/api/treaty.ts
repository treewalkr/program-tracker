import { treaty } from "@elysiajs/eden";
import type { App } from "@pt/api";
import { apiBase } from "./base";

/**
 * Eden Treaty client — the transport under the real adapter. Types flow from
 * the Elysia app (type-only import; no runtime coupling to the API package).
 */
export const client = treaty<App>(apiBase);
