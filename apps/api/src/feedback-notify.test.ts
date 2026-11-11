import { describe, expect, test } from "bun:test";
import { DEFAULT_FEEDBACK_EMAIL_PREFS, type FeedbackEmailPrefs } from "@pt/shared";
import { feedbackEmails, type FeedbackSnapshot, type Person } from "./lib/feedback-notify";

const person = (id: string, name: string, over: Partial<Person> = {}): Person => ({
  id,
  name,
  email: `${id}@example.com`,
  feedbackEmails: true,
  prefs: DEFAULT_FEEDBACK_EMAIL_PREFS,
  muted: false,
  inTicket: true,
  token: `tok-${id}`,
  ...over,
});
const withPrefs = (p: Person, prefs: Partial<FeedbackEmailPrefs>): Person => ({ ...p, prefs: { ...p.prefs, ...prefs } });
const kai = person("kai", "Kai");
const boss = person("boss", "Ana");
const mo = person("mo", "Mo");

const snap = (over: Partial<FeedbackSnapshot> = {}): FeedbackSnapshot => ({
  item: { id: "11111111-2222-3333-4444-555555555555", number: 12, comment: "Warm-up sets look like work sets.", route: "/clients/c1", shippedIn: null },
  reporter: kai,
  admin: boss,
  repliers: [],
  actor: kai,
  comment: null,
  reason: null,
  appUrl: "https://pt.test",
  ...over,
});
const to = (emails: { to: string }[]) => emails.map((e) => e.to).sort();

describe("feedbackEmails", () => {
  test("created emails the admin only, never an admin filing their own", () => {
    const out = feedbackEmails("created", snap());
    expect(to(out)).toEqual(["boss@example.com"]);
    expect(out[0].subject).toBe('[FB-012] New feedback from Kai: "Warm-up sets look like work sets."');
    expect(feedbackEmails("created", snap({ reporter: boss, actor: boss }))).toEqual([]);
  });

  test("a reply reaches everyone on the thread but its author, once each", () => {
    const out = feedbackEmails(
      "reply",
      snap({ actor: boss, repliers: [boss, mo, mo], comment: { body: "Which screen?", status: null, authorKind: "human" } }),
    );
    expect(to(out)).toEqual(["kai@example.com", "mo@example.com"]);
    expect(out[0].subject).toBe("[FB-012] Ana replied");
    expect(out[0].text).toContain("  Which screen?");
  });

  test("an AI answer is labelled as one and invites a correction", () => {
    const out = feedbackEmails(
      "reply",
      snap({ actor: null, comment: { body: "It's under Settings → Email.", status: null, authorKind: "ai" } }),
    );
    expect(to(out)).toEqual(["boss@example.com", "kai@example.com"]);
    expect(out[0].subject).toBe("[FB-012] AI answer to your feedback");
    expect(out[0].text).toContain("The AI assistant answered FB-012");
    expect(out[0].text).toContain("  It's under Settings → Email.");
    expect(out[0].text).toContain("reply on the ticket to correct it");
  });

  test("status changes email the reporter: accepted, won't fix with reason, shipped", () => {
    const accepted = feedbackEmails("status", snap({ actor: boss, comment: { body: null, status: "accepted", authorKind: "human" } }));
    expect(to(accepted)).toEqual(["kai@example.com"]);
    expect(accepted[0].subject).toBe("[FB-012] Accepted — on the build list");

    const wontfix = feedbackEmails(
      "status",
      snap({ actor: boss, reason: "Warm-ups are hidden by design", comment: { body: null, status: "wontfix", authorKind: "human" } }),
    );
    expect(wontfix[0].subject).toBe("[FB-012] Won't fix");
    expect(wontfix[0].text).toContain("Reason: Warm-ups are hidden by design");
    expect(wontfix[0].text).not.toContain("talk it through");

    const bare = feedbackEmails("status", snap({ actor: boss, comment: { body: null, status: "wontfix", authorKind: "human" } }));
    expect(bare[0].text).toContain("Reply on the item if you want to talk it through.");
    expect(bare[0].text).not.toContain("Reason:");

    const done = feedbackEmails(
      "status",
      snap({ actor: boss, item: { ...snap().item, shippedIn: "0.1.3" }, comment: { body: null, status: "done", authorKind: "human" } }),
    );
    expect(done[0].subject).toBe("[FB-012] Shipped in v0.1.3");
  });

  test("back to new, and changes the reporter made themselves, send nothing", () => {
    expect(feedbackEmails("status", snap({ actor: boss, comment: { body: null, status: "new", authorKind: "human" } }))).toEqual([]);
    expect(feedbackEmails("status", snap({ actor: kai, comment: { body: null, status: "accepted", authorKind: "human" } }))).toEqual([]);
  });

  test("opted-out people and unknown reporters are skipped", () => {
    const quiet = person("kai", "Kai", { feedbackEmails: false });
    expect(feedbackEmails("status", snap({ reporter: quiet, actor: boss, comment: { body: null, status: "accepted", authorKind: "human" } }))).toEqual([]);
    expect(feedbackEmails("status", snap({ reporter: null, actor: boss, comment: { body: null, status: "done", authorKind: "human" } }))).toEqual([]);
    expect(feedbackEmails("created", snap({ admin: person("boss", "Ana", { feedbackEmails: false }) }))).toEqual([]);
  });

  test("every email links to the item and to Settings, and escapes HTML", () => {
    const [e] = feedbackEmails("created", snap({ item: { ...snap().item, comment: "<script>x</script> broken" } }));
    for (const body of [e.text, e.html]) {
      expect(body).toContain("https://pt.test/feedback#FB-012");
      expect(body).toContain("https://pt.test/settings");
    }
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
  });

  test("the master switch off silences every event", () => {
    const off = (p: Person) => ({ ...p, feedbackEmails: false });
    expect(feedbackEmails("created", snap({ admin: off(boss) }))).toEqual([]);
    expect(feedbackEmails("reply", snap({ actor: mo, reporter: off(kai), admin: off(boss), comment: { body: "hi", status: null, authorKind: "human" } }))).toEqual([]);
    expect(feedbackEmails("status", snap({ actor: boss, reporter: off(kai), comment: { body: null, status: "done", authorKind: "human" } }))).toEqual([]);
  });

  test("a muted ticket sends that person nothing, others still hear", () => {
    const mutedKai = { ...kai, muted: true };
    expect(feedbackEmails("status", snap({ actor: boss, reporter: mutedKai, comment: { body: null, status: "accepted", authorKind: "human" } }))).toEqual([]);
    const reply = feedbackEmails("reply", snap({ actor: mo, reporter: mutedKai, repliers: [mo], comment: { body: "hi", status: null, authorKind: "human" } }));
    expect(to(reply)).toEqual(["boss@example.com"]);
    expect(feedbackEmails("created", snap({ admin: { ...boss, muted: true } }))).toEqual([]);
  });

  test("created needs newTickets", () => {
    expect(feedbackEmails("created", snap({ admin: withPrefs(boss, { newTickets: false }) }))).toEqual([]);
    expect(to(feedbackEmails("created", snap({ admin: withPrefs(boss, { replies: "off", status: false }) })))).toEqual([
      "boss@example.com",
    ]);
  });

  test("replies off skips the person; mine needs them in the ticket", () => {
    const reply = (admin: Person) =>
      to(feedbackEmails("reply", snap({ actor: kai, admin, comment: { body: "hi", status: null, authorKind: "human" } })));
    expect(reply(withPrefs(boss, { replies: "off" }))).toEqual([]);
    expect(reply(withPrefs({ ...boss, inTicket: false }, { replies: "all" }))).toEqual(["boss@example.com"]);
    expect(reply(withPrefs({ ...boss, inTicket: false }, { replies: "mine" }))).toEqual([]);
    expect(reply(withPrefs({ ...boss, inTicket: true }, { replies: "mine" }))).toEqual(["boss@example.com"]);
  });

  test("status needs the status pref; other prefs do not matter", () => {
    const status = (reporter: Person) =>
      feedbackEmails("status", snap({ actor: boss, reporter, comment: { body: null, status: "accepted", authorKind: "human" } }));
    expect(status(withPrefs(kai, { status: false }))).toEqual([]);
    expect(to(status(withPrefs(kai, { replies: "off", newTickets: false })))).toEqual(["kai@example.com"]);
  });

  test("each recipient's footer carries their own unsubscribe links", () => {
    const out = feedbackEmails("reply", snap({ actor: mo, repliers: [mo], comment: { body: "hi", status: null, authorKind: "human" } }));
    const kaiMail = out.find((e) => e.to === "kai@example.com")!;
    const bossMail = out.find((e) => e.to === "boss@example.com")!;
    const base = "https://pt.test/v1/email/unsubscribe?t=tok-kai&scope=";
    for (const body of [kaiMail.text, kaiMail.html.replaceAll("&amp;", "&")]) {
      expect(body).toContain(`${base}ticket%3A11111111-2222-3333-4444-555555555555`);
      expect(body).toContain(`${base}event%3Areplies`);
      expect(body).toContain(`${base}all`);
      expect(body).toContain("https://pt.test/settings");
      expect(body).not.toContain("tok-boss");
    }
    expect(kaiMail.text).toContain("Mute FB-012: ");
    expect(kaiMail.html).toContain("Mute FB-012</a> · <a");
    expect(kaiMail.html).toContain(">Stop reply emails</a>");
    expect(kaiMail.html).toContain(">Unsubscribe from all</a>");
    expect(kaiMail.html).toContain(">Manage in Settings</a>");
    expect(bossMail.text).toContain("t=tok-boss&scope=all");
    expect(kaiMail.headers).toEqual({
      "List-Unsubscribe": `<${base}all>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  test("the stop link names the event that triggered the email", () => {
    const [created] = feedbackEmails("created", snap());
    expect(created.text).toContain("Stop new-ticket emails: https://pt.test/v1/email/unsubscribe?t=tok-boss&scope=event%3AnewTickets");
    const [status] = feedbackEmails("status", snap({ actor: boss, comment: { body: null, status: "done", authorKind: "human" } }));
    expect(status.text).toContain("Stop status emails: https://pt.test/v1/email/unsubscribe?t=tok-kai&scope=event%3Astatus");
  });

  test("no token yet: only the Settings link, no list headers", () => {
    const [e] = feedbackEmails("created", snap({ admin: { ...boss, token: null } }));
    expect(e.text).not.toContain("/v1/email/unsubscribe");
    expect(e.text).toContain("Manage in Settings: https://pt.test/settings");
    expect(e.headers).toBeUndefined();
  });
});
