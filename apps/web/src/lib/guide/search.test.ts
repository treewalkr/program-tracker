import { describe, expect, test } from "bun:test";
import { GUIDE_IDS } from "./clientPortal";
import { PROGRAMS_GUIDE_IDS } from "./programsWeeks";
import { commonQuestions, guideSections, guideUnits, plain, searchGuides, snippet } from "./search";
import * as search from "./search";
import { TRAINER_ACCESS_IDS } from "./trainerAccess";
import { CARDIO_GUIDE_IDS } from "./cardio";

const SECTION_IDS: Record<string, readonly string[]> = {
  "/guide/programs-and-weeks": PROGRAMS_GUIDE_IDS,
  "/guide/client-portal": GUIDE_IDS,
  "/guide/trainer-access": TRAINER_ACCESS_IDS,
  "/guide/cardio": CARDIO_GUIDE_IDS,
};

describe("guide search index", () => {
  test("English and Thai have the same units, key for key", () => {
    const keys = (l: "en" | "th") => guideUnits(l, { admin: true }).map((u) => u.key);
    expect(keys("th")).toEqual(keys("en"));
    expect(new Set(keys("en")).size).toBe(keys("en").length);
  });

  test("every href points at a real section", () => {
    for (const l of ["en", "th"] as const)
      for (const u of guideUnits(l, { admin: true })) {
        const [path, id] = u.href.split("#");
        expect(SECTION_IDS[path]).toContain(id);
      }
  });

  test("no inline markup survives", () => {
    expect(plain("**Bold** *it* `code` ⟦neutral|draft⟧")).toBe("Bold it code draft");
    for (const l of ["en", "th"] as const)
      for (const u of guideUnits(l, { admin: true })) expect(u.title + u.body).not.toMatch(/\*|`|⟦|⟧/);
  });

  test("Trainer access is for the admin only", () => {
    expect(guideUnits("en").some((u) => u.guide === "access")).toBe(false);
    expect(searchGuides("invited", "en").some((h) => h.unit.guide === "access")).toBe(false);
    expect(searchGuides("invited", "en", { admin: true }).some((h) => h.unit.guide === "access")).toBe(true);
  });
});

describe("searchGuides", () => {
  const sick = "programs/answers/0/3";

  test("“sick” ranks the Quick answers row first", () => {
    const [top] = searchGuides("sick", "en");
    expect(top.unit.key).toBe(sick);
    expect(top.unit.title).toBe("“My member was sick for a week.”");
  });

  test("“ป่วย” finds the same row", () => {
    expect(searchGuides("ป่วย", "th")[0].unit.key).toBe(sick);
    expect(searchGuides("ป่วย", "en")[0].unit.key).toBe(sick);
  });

  test("an English query on a Thai page shows the Thai text", () => {
    const [top] = searchGuides("sick", "th");
    expect(top.unit.key).toBe(sick);
    expect(top.unit.title).toContain("ป่วย");
  });

  test("every word must match", () => {
    const both = searchGuides("week later", "en");
    expect(both.length).toBeGreaterThan(0);
    expect(searchGuides("sick zebra", "en")).toEqual([]);
    for (const h of both) {
      const text = (h.unit.title + " " + h.unit.body).toLowerCase();
      const th = guideUnits("th").find((u) => u.key === h.unit.key)!;
      const either = text + (th.title + th.body).toLowerCase();
      expect(either).toContain("week");
      expect(either).toContain("later");
    }
  });

  test("curly and straight quotes match alike", () => {
    expect(searchGuides("can't see", "en")[0].unit.key).toBe(searchGuides("can’t see", "en")[0].unit.key);
  });

  test("a section title outranks a body mention", () => {
    expect(searchGuides("quick answers", "en")[0].unit.kind).toBe("section");
  });

  test("the old word still finds the member answers", () => {
    // “client”/“clients” alias to member/members, so old habits find the answers.
    const addMember = searchGuides("client add", "en").find((h) => h.unit.title === "Add the member");
    expect(addMember).toBeDefined();
    expect(searchGuides("client", "en").some((h) => h.unit.guide === "portal")).toBe(true);
    expect(searchGuides("clients", "en")[0]).toBeDefined();
  });

  test("expandWords maps the alias only", () => {
    expect(search.expandWords(["client"])).toEqual(["client", "member"]);
    expect(search.expandWords(["clients", "week"])).toEqual(["clients", "members", "week"]);
    expect(search.expandWords(["member"])).toEqual(["member"]);
  });
});

describe("snippet", () => {
  const thai = guideUnits("th").filter((u) => u.body.length > 160 && /[฀-๿]/.test(u.body));

  test("never cuts a Thai word", () => {
    expect(thai.length).toBeGreaterThan(3);
    const seg = new Intl.Segmenter("th", { granularity: "word" });
    for (const u of thai) {
      const bounds = new Set([...seg.segment(u.body)].map((s) => s.index).concat(u.body.length));
      const mid = u.body.slice(u.body.length / 2, u.body.length / 2 + 6).trim();
      const parts = snippet(u.body, [mid.slice(0, 3)], "th");
      const inner = parts.map((p) => p.text).join("").replace(/^…|…$/g, "");
      const at = u.body.indexOf(inner);
      expect(at).toBeGreaterThanOrEqual(0);
      // Trimmed whitespace aside, both ends sit on a word boundary.
      const start = at;
      const end = at + inner.length;
      expect(bounds.has(start) || /\s/.test(u.body[start - 1])).toBe(true);
      expect(bounds.has(end) || /\s/.test(u.body[end])).toBe(true);
    }
  });

  test("marks every word and adds ellipses where it cut", () => {
    const body = guideUnits("en").find((u) => u.body.length > 240)!.body;
    const word = body.slice(170, 190).split(/\s+/)[1].toLowerCase();
    const parts = snippet(body, [word], "en");
    expect(parts[0].text).toBe("…");
    expect(parts.some((p) => p.hit && p.text.toLowerCase() === word)).toBe(true);
  });
});

describe("empty state", () => {
  test("common questions are the two Q&A tables", () => {
    const qs = commonQuestions("en");
    expect(qs).toHaveLength(12);
    expect(qs.every((u) => u.kind === "question")).toBe(true);
    expect(commonQuestions("th").map((u) => u.key)).toEqual(qs.map((u) => u.key));
  });

  test("sections are grouped per guide", () => {
    const groups = guideSections("en");
    expect(groups.map((g) => g.guide)).toEqual(["programs", "portal", "cardio"]);
    expect(groups[0].units.map((u) => u.sectionId)).toEqual([...PROGRAMS_GUIDE_IDS]);
    expect(guideSections("en", { admin: true }).map((g) => g.guide)).toEqual(["programs", "portal", "cardio", "access"]);
  });
});
