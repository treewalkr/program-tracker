import { Elysia, t } from "elysia";
import {
  appUrl,
  applyUnsubscribe,
  parseScope,
  resolveLink,
  scopeParam,
  type LinkTarget,
  type UnsubscribeScope,
} from "../lib/email-links";

/**
 * Unsubscribe links from feedback emails. Public — the token in the link is
 * the credential, no session needed. GET only shows a confirm page (link
 * scanners prefetch GETs); POST makes the change — from that page's button,
 * or a mail client's RFC 8058 one-click (`List-Unsubscribe=One-Click`).
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const EVENT_NAMES = { newTickets: "new-ticket", replies: "reply", status: "status" } as const;

/** Question, button, and the done line for a scope. */
function wording(scope: UnsubscribeScope, target: LinkTarget) {
  if (scope.kind === "all") {
    return {
      ask: "Unsubscribe from all feedback emails?",
      button: "Unsubscribe from all",
      done: "You're unsubscribed from all feedback emails.",
    };
  }
  if (scope.kind === "event") {
    const name = EVENT_NAMES[scope.event];
    return { ask: `Stop ${name} emails?`, button: `Stop ${name} emails`, done: `You won't get ${name} emails any more.` };
  }
  const h = target.handle ?? "this ticket";
  return { ask: `Mute ${h}?`, button: `Mute ${h}`, done: `${h} is muted — no more emails about it.` };
}

const BUTTON =
  "font:inherit;font-weight:600;padding:6px 14px;border-radius:6px;border:1px solid rgba(31,35,40,.15);cursor:pointer";

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · Program Tracker</title></head>
<body style="margin:0;padding:48px 16px;background:#f6f8fa">
<main style="font:14px/1.5 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2328;max-width:440px;margin:0 auto;padding:24px;background:#fff;border:1px solid #d0d7de;border-radius:6px">
${body}
<p style="margin:24px 0 0;font-size:12px;color:#656d76">Program Tracker feedback · <a href="${esc(appUrl())}/settings" style="color:#656d76">Manage in Settings</a></p>
</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const form = (action: string, label: string, primary: boolean, hidden: Record<string, string> = {}) =>
  `<form method="post" action="${esc(action)}" style="margin:16px 0 0">${Object.entries(hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("")}<button type="submit" style="${BUTTON};${primary ? "background:#1f883d;color:#fff" : "background:#f6f8fa;color:#1f2328"}">${esc(label)}</button></form>`;

const invalid = () =>
  page(
    "Link no longer valid",
    `<h1 style="font-size:18px;margin:0 0 8px">This link is no longer valid</h1><p style="margin:0">Manage your feedback emails in Settings.</p>`,
    404,
  );

const action = (token: string, scope: UnsubscribeScope) =>
  `/v1/email/unsubscribe?t=${encodeURIComponent(token)}&scope=${encodeURIComponent(scopeParam(scope))}`;

const Query = t.Object({ t: t.Optional(t.String()), scope: t.Optional(t.String()) });

function confirmPage(token: string, scope: UnsubscribeScope, target: LinkTarget, note?: string) {
  const w = wording(scope, target);
  return page(
    w.ask,
    `${note ? `<p style="margin:0 0 12px;color:#656d76">${esc(note)}</p>` : ""}<h1 style="font-size:18px;margin:0">${esc(w.ask)}</h1>${form(action(token, scope), w.button, true)}`,
  );
}

export const emailRoutes = new Elysia({ prefix: "/v1/email", tags: ["email"] })
  .get(
    "/unsubscribe",
    async ({ query }) => {
      const scope = parseScope(query.scope);
      const target = scope && (await resolveLink(query.t, scope));
      if (!scope || !target) return invalid();
      return confirmPage(query.t!, scope, target);
    },
    { query: Query, detail: { summary: "Unsubscribe confirm page (changes nothing)" } },
  )
  .post(
    "/unsubscribe",
    async ({ query, body }) => {
      const scope = parseScope(query.scope);
      const target = scope && (await resolveLink(query.t, scope));
      if (!scope || !target) return invalid();
      const fields = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
      if (fields.undo === "1") {
        await applyUnsubscribe(target, scope, { undo: true, restoreReplies: String(fields.replies ?? "") });
        return confirmPage(query.t!, scope, target, "Undone — these emails are back on.");
      }
      await applyUnsubscribe(target, scope);
      const w = wording(scope, target);
      return page(
        "Done",
        `<h1 style="font-size:18px;margin:0 0 8px">Done</h1><p style="margin:0">${esc(w.done)}</p>${form(
          action(query.t!, scope),
          "Undo",
          false,
          { undo: "1", ...(scope.kind === "event" && scope.event === "replies" ? { replies: target.prefs.replies } : {}) },
        )}`,
      );
    },
    {
      query: Query,
      body: t.Optional(t.Unknown()),
      detail: { summary: "Apply (or undo) an unsubscribe — page button or RFC 8058 one-click" },
    },
  );
