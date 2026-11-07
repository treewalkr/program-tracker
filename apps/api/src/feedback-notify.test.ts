import { describe, expect, test } from "bun:test";
import { feedbackEmails, type FeedbackSnapshot, type Person } from "./lib/feedback-notify";

const person = (id: string, name: string, over: Partial<Person> = {}): Person => ({
  id,
  name,
  email: `${id}@example.com`,
  feedbackEmails: true,
  ...over,
});
const kai = person("kai", "Kai");
const boss = person("boss", "Ana");
const mo = person("mo", "Mo");

const snap = (over: Partial<FeedbackSnapshot> = {}): FeedbackSnapshot => ({
  item: { number: 12, comment: "Warm-up sets look like work sets.", route: "/clients/c1", triageNote: null, shippedIn: null },
  reporter: kai,
  admin: boss,
  repliers: [],
  actor: kai,
  comment: null,
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
      snap({ actor: boss, repliers: [boss, mo, mo], comment: { body: "Which screen?", status: null } }),
    );
    expect(to(out)).toEqual(["kai@example.com", "mo@example.com"]);
    expect(out[0].subject).toBe("[FB-012] Ana replied");
    expect(out[0].text).toContain("  Which screen?");
  });

  test("status changes email the reporter: accepted, won't fix with reason, shipped", () => {
    const accepted = feedbackEmails("status", snap({ actor: boss, comment: { body: null, status: "accepted" } }));
    expect(to(accepted)).toEqual(["kai@example.com"]);
    expect(accepted[0].subject).toBe("[FB-012] Accepted — on the build list");

    const wontfix = feedbackEmails(
      "status",
      snap({ actor: boss, item: { ...snap().item, triageNote: "Warm-ups are hidden by design" }, comment: { body: null, status: "wontfix" } }),
    );
    expect(wontfix[0].subject).toBe("[FB-012] Won't fix");
    expect(wontfix[0].text).toContain("Reason: Warm-ups are hidden by design");

    const done = feedbackEmails(
      "status",
      snap({ actor: boss, item: { ...snap().item, shippedIn: "0.1.3" }, comment: { body: null, status: "done" } }),
    );
    expect(done[0].subject).toBe("[FB-012] Shipped in v0.1.3");
  });

  test("back to new, and changes the reporter made themselves, send nothing", () => {
    expect(feedbackEmails("status", snap({ actor: boss, comment: { body: null, status: "new" } }))).toEqual([]);
    expect(feedbackEmails("status", snap({ actor: kai, comment: { body: null, status: "accepted" } }))).toEqual([]);
  });

  test("opted-out people and unknown reporters are skipped", () => {
    const quiet = person("kai", "Kai", { feedbackEmails: false });
    expect(feedbackEmails("status", snap({ reporter: quiet, actor: boss, comment: { body: null, status: "accepted" } }))).toEqual([]);
    expect(feedbackEmails("status", snap({ reporter: null, actor: boss, comment: { body: null, status: "done" } }))).toEqual([]);
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
});
