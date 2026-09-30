import { treaty } from "@elysiajs/eden";
import type { App } from "@pt/api";
import { PUBLIC_API_URL } from "$env/static/public";

/**
 * Eden Treaty client — the transport under the real adapter. Types flow from
 * the Elysia app (type-only import; no runtime coupling to the API package).
 */
export const client = treaty<App>(PUBLIC_API_URL ?? "http://localhost:4000");
