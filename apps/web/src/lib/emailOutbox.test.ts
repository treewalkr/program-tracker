import { describe, expect, test } from "bun:test";
import {
  counts,
  fromSentEmails,
  groupByDay,
  hourlyBuckets,
  inFilter,
  matches,
  queueLag,
  sampleOutbox,
  tabOf,
  type OutboxMessage,
} from "./emailOutbox";

const NOW = Date.parse("2026-11-08T10:30:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const msg = (over: Partial<OutboxMessage>): OutboxMessage => ({
  id: "m",
  kind: "feedback.reply",
  label: "FB-012 · Reply",
  feedbackNumber: 12,
  recipient: { name: "Alex Rivera", email: "a•••@gmail.com" },
  status: "sent",
  createdAt: ago(5),
  sentAt: ago(5),
  attempts: [{ at: ago(5), ok: true, ms: 800 }],
  maxAttempts: 5,
  nextAttemptAt: null,
  dedupeKey: "k",
  event: "e",
  ...over,
});

describe("counts", () => {
  test("tallies each status and the 24 h windows", () => {
    const c = counts(
      [
        msg({ status: "queued", sentAt: null, attempts: [] }),
        msg({ status: "sending", sentAt: null, attempts: [] }),
        msg({ status: "retrying", sentAt: null, attempts: [{ at: ago(3), ok: false, error: "timeout" }] }),
        msg({ status: "dead", sentAt: null, attempts: [{ at: ago(60), ok: false, error: "bounced" }] }),
        msg({ status: "dead", sentAt: null, createdAt: ago(3000), attempts: [{ at: ago(3000), ok: false }] }),
        msg({}),
        msg({ sentAt: ago(25 * 60), createdAt: ago(25 * 60) }),
      ],
      NOW,
    );
    expect(c).toEqual({ queued: 1, sending: 1, retrying: 1, dead: 2, sent: 2, sent24h: 1, dead24h: 1 });
  });
});

describe("queueLag", () => {
  test("is the age of the oldest queued message", () => {
    const lag = queueLag(
      [
        msg({ status: "queued", createdAt: ago(1) }),
        msg({ status: "queued", createdAt: ago(4) }),
        msg({ status: "retrying", createdAt: ago(30) }),
      ],
      NOW,
    );
    expect(lag).toBe(4 * 60_000);
  });
  test("is null with nothing queued", () => {
    expect(queueLag([msg({})], NOW)).toBeNull();
  });
});

describe("hourlyBuckets", () => {
  test("returns 24 hours ending with the current one, counting sends and failed attempts", () => {
    const b = hourlyBuckets(
      [
        msg({ sentAt: ago(5) }),
        msg({ sentAt: ago(10), attempts: [{ at: ago(70), ok: false }, { at: ago(10), ok: true }] }),
        msg({ sentAt: ago(30 * 60) }), // outside the window
      ],
      NOW,
    );
    expect(b).toHaveLength(24);
    expect(b[23].start).toBe(Date.parse("2026-11-08T10:00:00Z"));
    expect(b[23].sent).toBe(2);
    expect(b[22].failed).toBe(1);
    expect(b.reduce((n, x) => n + x.sent, 0)).toBe(2);
  });
});

describe("groupByDay", () => {
  test("labels today and yesterday and keeps order", () => {
    const g = groupByDay([msg({ id: "a", sentAt: ago(1) }), msg({ id: "b", sentAt: ago(24 * 60) })], NOW);
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday"]);
    expect(g[0].messages[0].id).toBe("a");
  });
});

describe("matches", () => {
  const m = msg({});
  test("finds by recipient name and by ticket in any form", () => {
    expect(matches(m, "alex")).toBe(true);
    expect(matches(m, "FB-12")).toBe(true);
    expect(matches(m, "fb-012")).toBe(true);
    expect(matches(m, "12")).toBe(true);
    expect(matches(m, "13")).toBe(false);
    expect(matches(m, "priya")).toBe(false);
    expect(matches(m, "  ")).toBe(true);
  });
  test("a removed account still matches by ticket", () => {
    expect(matches(msg({ recipient: null }), "fb-12")).toBe(true);
  });
});

describe("filters", () => {
  test("status filters from the strip sit under the queue tab", () => {
    expect(tabOf("retrying")).toBe("queue");
    expect(tabOf("failed")).toBe("failed");
    expect(inFilter(msg({ status: "sending" }), "queue")).toBe(true);
    expect(inFilter(msg({ status: "dead" }), "failed")).toBe(true);
    expect(inFilter(msg({ status: "dead" }), "queue")).toBe(false);
  });
});

describe("fromSentEmails", () => {
  test("maps the send log to sent or dead with one attempt", () => {
    const snap = fromSentEmails([
      {
        id: "11111111-aaaa",
        kind: "feedback.reply",
        label: "FB-004 · Reply",
        error: null,
        sentAt: ago(10),
        recipient: { name: "Mai", email: "m•••@gmail.com" },
        feedbackNumber: 4,
      },
      {
        id: "22222222-bbbb",
        kind: "feedback.created",
        label: "FB-005 · New ticket",
        error: "provider_error",
        sentAt: ago(20),
        recipient: null,
        feedbackNumber: 5,
      },
    ]);
    expect(snap.source).toBe("log");
    expect(snap.dispatcher).toBeUndefined();
    expect(snap.messages[0]).toMatchObject({ status: "sent", sentAt: ago(10), attempts: [{ ok: true }] });
    expect(snap.messages[1]).toMatchObject({
      status: "dead",
      sentAt: null,
      recipient: null,
      attempts: [{ ok: false, error: "provider_error" }],
    });
  });
});

describe("sampleOutbox", () => {
  const snap = sampleOutbox(NOW);
  test("covers every status and the edge cases", () => {
    const c = counts(snap.messages, NOW);
    expect(snap.source).toBe("outbox");
    expect(c).toMatchObject({ queued: 3, sending: 1, retrying: 2 });
    expect(c.dead).toBeGreaterThanOrEqual(2);
    expect(c.sent).toBeGreaterThan(25);
    expect(snap.messages.length).toBeGreaterThanOrEqual(40);
    expect(snap.messages.some((m) => m.recipient === null)).toBe(true);
    expect(snap.messages.some((m) => m.attempts.some((a) => a.error === "not_configured"))).toBe(true);
    expect(snap.dispatcher?.healthy).toBe(true);
  });
  test("is deterministic and shows a 4 minute queue lag", () => {
    expect(sampleOutbox(NOW)).toEqual(snap);
    expect(queueLag(snap.messages, NOW)).toBe(4 * 60_000);
  });
  test("stays within the last 48 h", () => {
    for (const m of snap.messages) expect(NOW - Date.parse(m.createdAt)).toBeLessThanOrEqual(48 * 3_600_000);
  });
});
