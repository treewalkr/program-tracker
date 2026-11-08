import { feedbackHandle } from "@pt/shared";
import type { SentEmail } from "$lib/api/admin";

/**
 * Outbox-shaped view model for the admin email monitor.
 *
 * These types are web-local until the outbox endpoint exists. Today the API
 * only returns the `email_log` (one row per finished send); `fromSentEmails`
 * adapts that into this shape. Once the outbox ships, these types come from
 * Eden Treaty and the adapter goes away.
 */

export type OutboxStatus = "queued" | "sending" | "retrying" | "sent" | "dead";

export interface OutboxAttempt {
  at: string;
  ok: boolean;
  /** provider_error | bounced | not_configured | timeout */
  error?: string;
  /** Provider round-trip time. */
  ms?: number;
}

export interface OutboxMessage {
  id: string;
  kind: string;
  label: string;
  feedbackNumber: number | null;
  /** Masked address; null when the account was removed. */
  recipient: { name: string; email: string } | null;
  status: OutboxStatus;
  createdAt: string;
  sentAt: string | null;
  attempts: OutboxAttempt[];
  maxAttempts: number;
  nextAttemptAt: string | null;
  /** e.g. feedback.reply:FB-012:<comment>:<trainer> */
  dedupeKey: string;
  /** The domain event that enqueued the message ("FB-012 reply by Alex"). */
  event: string;
}

export interface OutboxSnapshot {
  /** "log" = adapted from the send log: no queue, no retries, no actions. */
  source: "log" | "outbox";
  messages: OutboxMessage[];
  dispatcher?: { lastRunAt: string; healthy: boolean };
}

export const KIND: Record<string, string> = {
  "feedback.created": "New ticket",
  "feedback.reply": "Reply",
  "feedback.status": "Status change",
};

export const ERROR: Record<string, string> = {
  provider_error: "Provider refused",
  not_configured: "Email off",
  bounced: "Bounced",
  timeout: "Timed out",
};

export const STATUS: Record<OutboxStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  retrying: "Retrying",
  sent: "Sent",
  dead: "Failed",
};

/** One filter state shared by the health strip and the tabs. */
export type OutboxFilter = "all" | "queue" | "failed" | "sent" | "queued" | "sending" | "retrying";

/** Which tab a filter lights up (status filters from the strip sit under "In queue"). */
export const tabOf = (f: OutboxFilter): "all" | "queue" | "failed" | "sent" =>
  f === "queued" || f === "sending" || f === "retrying" ? "queue" : f;

export function inFilter(m: OutboxMessage, f: OutboxFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "queue":
      return m.status === "queued" || m.status === "sending" || m.status === "retrying";
    case "failed":
      return m.status === "dead";
    default:
      return m.status === f;
  }
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface OutboxCounts {
  queued: number;
  sending: number;
  retrying: number;
  dead: number;
  sent: number;
  /** Sent in the last 24 h. */
  sent24h: number;
  /** Failed (dead) in the last 24 h. */
  dead24h: number;
}

/** When a message last changed: sent time, else its latest attempt, else creation. */
export const lastActivity = (m: OutboxMessage): string =>
  m.sentAt ?? m.attempts.at(-1)?.at ?? m.createdAt;

export function counts(messages: OutboxMessage[], now = Date.now()): OutboxCounts {
  const c: OutboxCounts = { queued: 0, sending: 0, retrying: 0, dead: 0, sent: 0, sent24h: 0, dead24h: 0 };
  for (const m of messages) {
    c[m.status]++;
    const recent = now - Date.parse(lastActivity(m)) <= DAY;
    if (m.status === "sent" && recent) c.sent24h++;
    if (m.status === "dead" && recent) c.dead24h++;
  }
  return c;
}

/** Age in ms of the oldest message still waiting to go out; null when nothing waits. */
export function queueLag(messages: OutboxMessage[], now = Date.now()): number | null {
  let oldest: number | null = null;
  for (const m of messages) {
    if (m.status !== "queued") continue;
    const t = Date.parse(m.createdAt);
    if (oldest === null || t < oldest) oldest = t;
  }
  return oldest === null ? null : Math.max(0, now - oldest);
}

export interface HourBucket {
  /** Start of the hour (epoch ms). */
  start: number;
  sent: number;
  failed: number;
}

/**
 * 24 hourly buckets ending with the current hour, oldest first. Sends count
 * at their sent time; failures at each failed attempt (so retries show).
 */
export function hourlyBuckets(messages: OutboxMessage[], now = Date.now()): HourBucket[] {
  const current = Math.floor(now / HOUR) * HOUR;
  const first = current - 23 * HOUR;
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, i) => ({ start: first + i * HOUR, sent: 0, failed: 0 }));
  const slot = (iso: string) => {
    const i = Math.floor((Date.parse(iso) - first) / HOUR);
    return i >= 0 && i < 24 ? buckets[i] : undefined;
  };
  for (const m of messages) {
    if (m.sentAt) {
      const b = slot(m.sentAt);
      if (b) b.sent++;
    }
    for (const a of m.attempts) {
      if (a.ok) continue;
      const b = slot(a.at);
      if (b) b.failed++;
    }
  }
  return buckets;
}

export interface DayGroup {
  key: string;
  label: string;
  messages: OutboxMessage[];
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Groups by local day of last activity, keeping input order. Labels: Today / Yesterday / date. */
export function groupByDay(messages: OutboxMessage[], now = Date.now()): DayGroup[] {
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const label = (d: Date) => {
    const k = dayKey(d);
    if (k === dayKey(today)) return "Today";
    if (k === dayKey(yesterday)) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  };
  const groups: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const m of messages) {
    const d = new Date(lastActivity(m));
    const k = dayKey(d);
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, label: label(d), messages: [] };
      byKey.set(k, g);
      groups.push(g);
    }
    g.messages.push(m);
  }
  return groups;
}

/** Search by recipient name or ticket ("FB-12", "fb-012", "12"). */
export function matches(m: OutboxMessage, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const ticket = q.match(/^(?:fb-?)?0*(\d+)$/);
  if (ticket && m.feedbackNumber === Number(ticket[1])) return true;
  return (m.recipient?.name.toLowerCase().includes(q) ?? false) || m.label.toLowerCase().includes(q);
}

/** Newest activity first. */
export const byRecent = (a: OutboxMessage, b: OutboxMessage) =>
  Date.parse(lastActivity(b)) - Date.parse(lastActivity(a));

/** Adapts the current send log: every row is a finished single attempt. */
export function fromSentEmails(sends: SentEmail[]): OutboxSnapshot {
  return {
    source: "log",
    messages: sends.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      feedbackNumber: s.feedbackNumber,
      recipient: s.recipient,
      status: s.error ? "dead" : "sent",
      createdAt: s.sentAt,
      sentAt: s.error ? null : s.sentAt,
      attempts: [s.error ? { at: s.sentAt, ok: false, error: s.error } : { at: s.sentAt, ok: true }],
      maxAttempts: 1,
      nextAttemptAt: null,
      dedupeKey: `${s.kind}:${s.feedbackNumber !== null ? feedbackHandle(s.feedbackNumber) : "—"}:${s.id.slice(0, 8)}`,
      event: s.label,
    })),
  };
}

// ── Sample data ────────────────────────────────────────────────────────────

/** Small deterministic PRNG so the sample looks the same on every load. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE = [
  { name: "Alex Rivera", email: "a•••@gmail.com" },
  { name: "Priya Nair", email: "p•••@outlook.com" },
  { name: "Tom Okafor", email: "t•••@strongcoach.co" },
  { name: "Mai Tanaka", email: "m•••@gmail.com" },
  { name: "Jordan Lee", email: "j•••@icloud.com" },
  { name: "Somchai Prasert", email: "s•••@hotmail.com" },
];

const ACTORS = ["Alex", "Priya", "Tom", "Mai", "Jordan", "Somchai", "Admin"];
const STATUS_LABELS = ["Accepted", "Won't fix", "Shipped in v0.1.2", "Done"];
const KINDS = ["feedback.created", "feedback.reply", "feedback.status"] as const;

interface Draft {
  status: OutboxStatus;
  /** Minutes before now the event happened. */
  ageMin: number;
  kind?: (typeof KINDS)[number];
  recipient?: { name: string; email: string } | null;
  error?: string;
  attempts?: number;
  nextInMin?: number;
}

/**
 * ~45 realistic outbox messages over the last 48 h, relative to `now`:
 * a few waiting (oldest 4 min → visible lag), one in flight, two retrying,
 * two dead, one removed-account recipient, one historical "email off".
 */
export function sampleOutbox(now = Date.now()): OutboxSnapshot {
  const rand = rng(20261108);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const iso = (ms: number) => new Date(ms).toISOString();

  const drafts: Draft[] = [
    { status: "queued", ageMin: 4, kind: "feedback.reply" },
    { status: "queued", ageMin: 2.2, kind: "feedback.created" },
    { status: "queued", ageMin: 0.6, kind: "feedback.status" },
    { status: "sending", ageMin: 0.2, kind: "feedback.reply" },
    { status: "retrying", ageMin: 9, kind: "feedback.reply", error: "timeout", attempts: 2, nextInMin: 2 },
    { status: "retrying", ageMin: 26, kind: "feedback.status", error: "provider_error", attempts: 3, nextInMin: 6 },
    { status: "dead", ageMin: 190, kind: "feedback.created", error: "provider_error", attempts: 5 },
    { status: "dead", ageMin: 610, kind: "feedback.reply", error: "bounced", attempts: 1 },
    { status: "sent", ageMin: 330, kind: "feedback.status", recipient: null },
    { status: "dead", ageMin: 41 * 60, kind: "feedback.created", error: "not_configured", attempts: 1 },
  ];
  // The rest: sent, spread over 48 h with a busier working-hours rhythm.
  let age = 14;
  while (drafts.length < 46) {
    age += 8 + rand() * 95;
    if (age > 47.5 * 60) break;
    drafts.push({ status: "sent", ageMin: age });
  }

  const messages: OutboxMessage[] = drafts.map((d, i) => {
    const kind = d.kind ?? pick(KINDS);
    const recipient = d.recipient === undefined ? pick(PEOPLE) : d.recipient;
    const number = 3 + Math.floor(rand() * 38);
    const handle = feedbackHandle(number);
    const actor = pick(ACTORS);
    const what =
      kind === "feedback.created" ? "New ticket" : kind === "feedback.reply" ? "Reply" : pick(STATUS_LABELS);
    const event =
      kind === "feedback.created"
        ? `${handle} opened by ${actor}`
        : kind === "feedback.reply"
          ? `${handle} reply by ${actor}`
          : `${handle} marked ${what.toLowerCase()} by Admin`;
    const created = now - d.ageMin * 60_000;
    const id = `0b${(i + 1).toString(16).padStart(6, "0")}-7c1e-4f2a-9d3b-${(number * 7919 + i).toString(16).padStart(12, "0")}`;
    const ref = Math.floor(rand() * 0xffffff)
      .toString(16)
      .padStart(6, "0");
    const who = recipient ? recipient.name.split(" ")[0].toLowerCase() : "removed";

    const attempts: OutboxAttempt[] = [];
    let sentAt: string | null = null;
    let nextAttemptAt: string | null = null;
    const maxAttempts = 5;
    const latency = () => Math.round(300 + rand() * 1700);

    if (d.status === "sent") {
      // An occasional earlier timeout, then success.
      let t = created + 800 + rand() * 4000;
      if (rand() < 0.12) {
        attempts.push({ at: iso(t), ok: false, error: "timeout", ms: 10_000 });
        t += 60_000 + rand() * 60_000;
      }
      const ms = latency();
      attempts.push({ at: iso(t), ok: true, ms });
      sentAt = iso(t + ms);
    } else if (d.status === "retrying" || d.status === "dead") {
      const n = d.attempts ?? 1;
      let t = created + 900;
      for (let k = 0; k < n; k++) {
        attempts.push({ at: iso(t), ok: false, error: d.error, ms: d.error === "timeout" ? 10_000 : latency() });
        t += 30_000 * 2 ** k;
      }
      if (d.status === "retrying") nextAttemptAt = iso(now + (d.nextInMin ?? 1) * 60_000);
    }
    // queued / sending: no finished attempt yet.

    return {
      id,
      kind,
      label: `${handle} · ${what}`,
      feedbackNumber: number,
      recipient,
      status: d.status,
      createdAt: iso(created),
      sentAt,
      attempts,
      maxAttempts: d.error === "bounced" || d.error === "not_configured" ? 1 : maxAttempts,
      nextAttemptAt,
      dedupeKey: `${kind}:${handle}:${ref}:${who}`,
      event,
    };
  });

  messages.sort(byRecent);
  return { source: "outbox", messages, dispatcher: { lastRunAt: iso(now - 12_000), healthy: true } };
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** "4 min", "45 s", "2 h" — a compact duration. */
export function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** "1.2 s" / "640 ms" */
export const latency = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
