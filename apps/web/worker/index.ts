/**
 * pt.pinroj.com edge: static SPA from ./build, /v1/* forwarded to the API on
 * Render so the session cookie stays first-party on the web origin.
 */
interface Env {
  API_ORIGIN: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/v1/")) return env.ASSETS.fetch(req);

    const target = new URL(url.pathname + url.search, env.API_ORIGIN);
    const headers = new Headers(req.headers);
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");
    return fetch(target, {
      method: req.method,
      headers,
      body: req.body,
      redirect: "manual",
    });
  },

  /** Cron (every 10 min): ping the API so Render's free tier never sleeps. */
  async scheduled(_event: unknown, env: Env, ctx: Ctx): Promise<void> {
    ctx.waitUntil(
      fetch(new URL("/health", env.API_ORIGIN)).then(
        (res) => void res.body?.cancel(),
        (err) => console.error(`keep-warm ping failed: ${(err as Error).message}`),
      ),
    );
  },
};
