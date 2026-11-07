/**
 * Outbound email through Resend's REST API. HTTPS only — Render's free tier
 * blocks SMTP. With the env unset (local dev, tests, CI) every send is a
 * quiet no-op, so nothing else needs to know.
 *
 *   RESEND_API_KEY  key with sending access (`re_…`)
 *   EMAIL_FROM      `Program Tracker <feedback@pinroj.com>`, on a domain verified in Resend
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /** What the admin email log records about this send — never the address or body. */
  log?: { trainerId: string; kind: string; label: string; feedbackItemId?: string };
}

export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

interface EmailConfig {
  apiKey: string;
  /** As given: Resend takes `Name <addr>` directly. */
  from: string;
}

/** `Name <addr@x>` or a bare address → its parts. */
export function parseFrom(raw: string): { address: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (!m) return { address: raw.trim() };
  const name = m[1].replace(/^"|"$/g, "").trim();
  return name ? { address: m[2].trim(), name } : { address: m[2].trim() };
}

function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export const emailConfigured = () => emailConfig() !== null;

/** One boot line so a deploy shows whether email is on. Never logs the key. */
export function logEmailConfig(): void {
  const cfg = emailConfig();
  console.log(cfg ? `email: on — sending as ${parseFrom(cfg.from).address}` : "email: not configured — feedback emails off");
}

/** Sends one email. Never throws: failures are logged and reported in the result. */
export async function sendEmail(e: Email): Promise<SendResult> {
  const cfg = emailConfig();
  if (!cfg) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to: [e.to], subject: e.subject, text: e.text, html: e.html, ...(e.headers ? { headers: e.headers } : {}) }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
      const detail = body ? `${body.name ?? "error"}: ${body.message ?? ""}` : "no body";
      console.error(`email: send failed ${res.status} ${detail}`);
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true };
  } catch (err) {
    console.error(`email: send failed — ${(err as Error).message}`);
    return { sent: false, reason: "provider_error" };
  }
}
