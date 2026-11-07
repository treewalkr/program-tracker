import { feedbackEmailPrefs } from "@pt/shared";
import { feedbackEmails, type FeedbackEvent, type FeedbackSnapshot, type Person } from "./feedback-notify";
import type { Email } from "./mailer";

/**
 * Every email the app can send, rendered by the real template code from
 * sample data — so the admin catalog can never drift from what goes out.
 * Links point at the real app but carry a dummy token, so they don't act.
 */

export interface EmailPreview {
  id: string;
  /** Pref group the email belongs to: what Settings and unsubscribe links turn off. */
  group: "New tickets" | "Replies" | "Status changes";
  title: string;
  /** What makes it send. */
  trigger: string;
  /** Who gets it (before each person's own settings and mutes). */
  recipients: string;
  email: Email;
}

const PREVIEW_TOKEN = "preview";

const person = (id: string, name: string, email: string): Person => ({
  id,
  name,
  email,
  feedbackEmails: true,
  prefs: feedbackEmailPrefs(null),
  muted: false,
  inTicket: true,
  token: PREVIEW_TOKEN,
});

const ADMIN = person("00000000-0000-4000-8000-000000000001", "Admin", "admin@example.com");
const TRAINER = person("00000000-0000-4000-8000-000000000002", "Sam Trainer", "sam@example.com");

function snap(
  over: Partial<FeedbackSnapshot["item"]>,
  actor: Person,
  comment: FeedbackSnapshot["comment"],
  appUrl: string,
): FeedbackSnapshot {
  return {
    item: {
      id: "00000000-0000-4000-8000-0000000000aa",
      number: 42,
      comment: "The week totals on the client page don't include supersets.\nCould they count both exercises?",
      route: "/clients/abc",
      triageNote: null,
      shippedIn: null,
      ...over,
    },
    reporter: TRAINER,
    admin: ADMIN,
    repliers: [],
    actor,
    comment,
    appUrl,
  };
}

interface Case {
  id: string;
  group: EmailPreview["group"];
  title: string;
  trigger: string;
  recipients: string;
  kind: FeedbackEvent["kind"];
  snap: FeedbackSnapshot;
}

/** One preview per email variant. Pure. */
export function emailPreviews(appUrl: string): EmailPreview[] {
  const toAdmin = "The admin, unless they filed it themselves.";
  const toReporter = "The trainer who filed the ticket, unless they made the change.";
  const cases: Case[] = [
    {
      id: "created-page",
      group: "New tickets",
      title: "New ticket — pinned to a page",
      trigger: "A trainer files feedback from feedback mode, pinned to an element.",
      recipients: toAdmin,
      kind: "created",
      snap: snap({}, TRAINER, null, appUrl),
    },
    {
      id: "created-general",
      group: "New tickets",
      title: "New ticket — general",
      trigger: "A trainer files a ticket from the Feedback page, not pinned to a page.",
      recipients: toAdmin,
      kind: "created",
      snap: snap({ route: "" }, TRAINER, null, appUrl),
    },
    {
      id: "reply",
      group: "Replies",
      title: "Reply",
      trigger: "Someone replies on a ticket's thread.",
      recipients:
        "Everyone on the thread — the reporter, the admin and other repliers — except the person who replied. Replies set to “Only tickets I'm in” skip tickets the person never touched.",
      kind: "reply",
      snap: snap({}, ADMIN, { body: "Good catch — supersets should count once per exercise. Looking at it now.", status: null }, appUrl),
    },
    {
      id: "status-accepted",
      group: "Status changes",
      title: "Accepted",
      trigger: "The admin moves a ticket to Accepted.",
      recipients: toReporter,
      kind: "status",
      snap: snap({}, ADMIN, { body: null, status: "accepted" }, appUrl),
    },
    {
      id: "status-wontfix",
      group: "Status changes",
      title: "Won't fix",
      trigger: "The admin moves a ticket to Won't fix. Shows the triage note as the reason when there is one.",
      recipients: toReporter,
      kind: "status",
      snap: snap(
        { triageNote: "Supersets are logged as one block on purpose, so the totals match the program." },
        ADMIN,
        { body: null, status: "wontfix" },
        appUrl,
      ),
    },
    {
      id: "status-done",
      group: "Status changes",
      title: "Shipped",
      trigger: "The admin moves a ticket to Done. Names the version that was live at that moment.",
      recipients: toReporter,
      kind: "status",
      snap: snap({ shippedIn: "0.1.3" }, ADMIN, { body: null, status: "done" }, appUrl),
    },
  ];
  return cases.map(({ kind, snap: s, ...meta }) => {
    const [email] = feedbackEmails(kind, s);
    if (!email) throw new Error(`email preview ${meta.id} rendered nothing`);
    return { ...meta, email };
  });
}
