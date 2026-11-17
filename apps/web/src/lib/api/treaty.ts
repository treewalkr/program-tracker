import { treaty } from "@elysiajs/eden";
import { browser } from "$app/environment";
import type { App } from "@pt/api";
import { apiBase } from "./base";
import { capturingFetch } from "$lib/feedback/runtime";

/**
 * Eden Treaty client — the transport under the real adapter. Types flow from
 * the Elysia app (type-only import; no runtime coupling to the API package).
 * In the browser every call also feeds the feedback runtime recorder (failed
 * or slow calls, with their x-request-id); on the server it never does.
 */
export const client = treaty<App>(apiBase, browser ? { fetcher: capturingFetch(() => fetch) } : {});
