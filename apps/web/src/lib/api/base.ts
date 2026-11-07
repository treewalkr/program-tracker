import { browser } from "$app/environment";
import { PUBLIC_API_URL } from "$env/static/public";

/**
 * In the browser, call the API same-origin — Vite proxies /v1 to the API — so
 * the app works from any host (e.g. Tailscale on another device), not just localhost.
 */
export const apiBase = browser ? window.location.origin : (PUBLIC_API_URL ?? "http://localhost:4000");
