/**
 * Outbound email through Cloudflare Email Sending's REST API. HTTPS only —
 * Render's free tier blocks SMTP. With the env unset (local dev, tests, CI)
 * every send is a quiet no-op, so nothing else needs to know.
 *
 *   CLOUDFLARE_EMAIL_ACCOUNT_ID  account that owns the sending domain
 *   CLOUDFLARE_EMAIL_TOKEN       API token with Email Sending permission
 *   EMAIL_FROM                   `Program Tracker <feedback@pinroj.com>`
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

interface EmailConfig {
  accountId: string;
  token: string;
  from: { address: string; name?: string };
}

/** `Name <addr@x>` or a bare address → the REST `from` object. */
export function parseFrom(raw: string): { address: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (!m) return { address: raw.trim() };
  const name = m[1].replace(/^"|"$/g, "").trim();
  return name ? { address: m[2].trim(), name } : { address: m[2].trim() };
}

function emailConfig(): EmailConfig | null {
  const accountId = process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_EMAIL_TOKEN?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!accountId || !token || !from) return null;
  return { accountId, token, from: parseFrom(from) };
}

export const emailConfigured = () => emailConfig() !== null;

/** One boot line so a deploy shows whether email is on. Never logs the token. */
export function logEmailConfig(): void {
  const cfg = emailConfig();
  console.log(cfg ? `email: on — sending as ${cfg.from.address}` : "email: not configured — feedback emails off");
}

/** Sends one email. Never throws: failures are logged and reported in the result. */
export async function sendEmail(e: Email): Promise<SendResult> {
  const cfg = emailConfig();
  if (!cfg) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/email/sending/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify({ to: e.to, from: cfg.from, subject: e.subject, text: e.text, html: e.html }),
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      errors?: { code: number; message: string }[];
      result?: { permanent_bounces?: string[] } | null;
    } | null;
    if (!res.ok || !body?.success) {
      const detail = body?.errors?.map((x) => `${x.code} ${x.message}`).join("; ") ?? "no body";
      console.error(`email: send failed ${res.status} ${detail}`);
      return { sent: false, reason: "provider_error" };
    }
    if (body.result?.permanent_bounces?.length) {
      console.error(`email: permanent bounce for ${body.result.permanent_bounces.length} recipient(s)`);
    }
    return { sent: true };
  } catch (err) {
    console.error(`email: send failed — ${(err as Error).message}`);
    return { sent: false, reason: "provider_error" };
  }
}
