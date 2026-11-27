import { describe, expect, test } from "bun:test";
import {
  type Baseline,
  type BashContext,
  type StagedFile,
  checkBashCommand,
  checkClaudePath,
  checkFeedbackHandle,
  checkForbiddenPaths,
  checkMessage,
  checkMigrations,
  checkRatchet,
  checkReleaseDump,
  checkReleaseShape,
  checkSvelteRunes,
  commitSkipsHooks,
  computeBaseline,
  nPlusOneLines,
  countRatchets,
  formatProofTrailer,
  judgeProof,
  needsRedProof,
  parseBunTest,
  parseProofTrailer,
  proofFiles,
  proofStatus,
  segments,
  svelteFeedback,
  touchesData,
  withProofTrailer,
} from "./lib";

const rules = (vs: { rule: string }[]) => vs.map((x) => x.rule);

// Each rule has a red fixture (must refuse) and a green one (must pass).

describe("commit message: format", () => {
  test("red: free-form, unknown type, unknown scope, missing space", () => {
    expect(rules(checkMessage("Update the thing"))).toContain("format");
    expect(rules(checkMessage("wip: stuff"))).toContain("format");
    expect(rules(checkMessage("fix(frontend): stuff"))).toContain("format");
    expect(rules(checkMessage("fix:stuff"))).toContain("format");
  });
  test("green: every type, scopes, breaking marker", () => {
    expect(checkMessage("feat: add rest timer")).toEqual([]);
    expect(checkMessage("fix(api): stop double-logging a set")).toEqual([]);
    expect(checkMessage("feat(server)!: drop the v0 route")).toEqual([]);
    expect(checkMessage("revert: add rest timer")).toEqual([]);
  });
  test("green: merge commits and working fixups pass; a fixup does not land", () => {
    expect(checkMessage("Merge branch 't3/x' into main")).toEqual([]);
    expect(checkMessage("fixup! fix: a thing")).toEqual([]);
    expect(rules(checkMessage("fixup! fix: a thing", { final: true }))).toEqual(["fixup"]);
  });
  test("green: git comment lines are ignored", () => {
    expect(checkMessage("fix: tidy\n\n# Please enter the commit message")).toEqual([]);
  });
});

describe("commit message: subject", () => {
  test("red: longer than 100", () => {
    expect(rules(checkMessage(`fix: ${"a".repeat(96)}`))).toContain("subject-length");
  });
  test("green: exactly 100", () => {
    expect(checkMessage(`fix: ${"a".repeat(95)}`)).toEqual([]);
  });
  test("red: not imperative", () => {
    expect(rules(checkMessage("fix: fixes the rest timer"))).toEqual(["imperative"]);
    expect(rules(checkMessage("feat(app): Added a rest timer"))).toEqual(["imperative"]);
  });
  test("green: imperative", () => {
    expect(checkMessage("fix: fix the rest timer")).toEqual([]);
  });
});

describe("commit message: attribution", () => {
  test("red: Co-Authored-By, any case", () => {
    expect(rules(checkMessage("fix: a\n\nCo-Authored-By: Claude <x@y.z>"))).toEqual(["co-authored-by"]);
    expect(rules(checkMessage("fix: a\n\nco-authored-by: Someone"))).toEqual(["co-authored-by"]);
  });
  test("red: Generated with Claude Code", () => {
    expect(rules(checkMessage("fix: a\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"))).toEqual(["generated-by"]);
  });
  test("green: a body that mentions neither", () => {
    expect(checkMessage("fix: a\n\nThe coauthor field was wrong.")).toEqual([]);
  });
});

describe("commit message: feedback handle", () => {
  test("red: wrong shapes", () => {
    for (const s of ["fix: rest timer FB-012", "fix: rest timer (FB-12)", "fix: (FB-012) rest timer", "fix: rest timer [FB-012]", "fix: a (FB-012) and (FB-013)"]) {
      expect(rules(checkFeedbackHandle(s))).toEqual(["fb-handle"]);
    }
  });
  test("green: trailing handle, one or several; none at all", () => {
    expect(checkFeedbackHandle("fix: clearer rest timer (FB-012)")).toEqual([]);
    expect(checkFeedbackHandle("fix: clearer rest timer (FB-012, FB-013)")).toEqual([]);
    expect(checkFeedbackHandle("fix: clearer rest timer")).toEqual([]);
  });
});

describe("red proof: who needs one", () => {
  test("red: a fix touching non-UI source", () => {
    expect(needsRedProof("fix", ["apps/api/src/log.ts", "apps/api/src/log.test.ts"])).toBe(true);
    expect(needsRedProof("fix", ["packages/shared/src/x.ts"])).toBe(true);
  });
  test("green: other types, UI-only, tests-only, outside src", () => {
    expect(needsRedProof("feat", ["apps/api/src/log.ts"])).toBe(false);
    expect(needsRedProof("fix", ["apps/web/src/routes/a/+page.svelte", "apps/web/src/app.css"])).toBe(false);
    expect(needsRedProof("fix", ["apps/api/src/log.test.ts"])).toBe(false);
    expect(needsRedProof("fix", ["scripts/release.ts", "docs/x.md"])).toBe(false);
  });
});

describe("red proof: exemptions", () => {
  const msg = (ex: string) => `fix: x\n\nRed-Proof-Exempt: ${ex}`;
  test("red: a reason outside the list", () => {
    expect(rules(proofStatus(msg("lazy"), ["apps/api/src/a.ts"]).violations)).toEqual(["exempt-reason"]);
  });
  test("red: ui-only claimed on a change that has logic", () => {
    const r = proofStatus(msg("ui-only"), ["apps/api/src/a.ts"]);
    expect(rules(r.violations)).toEqual(["exempt-reason"]);
    expect(r.status).toBe("needs-proof");
  });
  test("green: a listed reason, with free text", () => {
    const r = proofStatus(msg("no-harness needs a browser"), ["apps/web/src/lib/a.ts"]);
    expect(r).toEqual({ status: "exempt", violations: [] });
    expect(proofStatus(msg("copy"), ["apps/web/src/lib/i18n/th.json"]).status).toBe("exempt");
    expect(proofStatus(msg("ui-only"), ["apps/web/src/a.svelte"]).status).toBe("exempt");
  });
  test("status: needs-proof without a trailer, not-needed otherwise", () => {
    expect(proofStatus("fix: x", ["apps/api/src/a.ts"]).status).toBe("needs-proof");
    expect(proofStatus("feat: x", ["apps/api/src/a.ts"]).status).toBe("not-needed");
  });
});

describe("red proof: trailer", () => {
  const t = { files: ["apps/api/src/a.test.ts", "apps/api/src/b.test.ts"], red: 2, green: 0, parent: "6af0606f" };
  test("format and parse round-trip", () => {
    expect(formatProofTrailer(t)).toBe("Red-Proof: apps/api/src/a.test.ts,apps/api/src/b.test.ts 2 fail -> 0 fail @ 6af0606f");
    expect(parseProofTrailer(formatProofTrailer(t))).toEqual(t);
  });
  test("red: junk is not a trailer", () => {
    expect(parseProofTrailer("Red-Proof: it works trust me")).toBeNull();
  });
  test("a hand-typed trailer is replaced, not kept", () => {
    const out = withProofTrailer("fix: x\n\nRed-Proof: a.test.ts 9 fail -> 0 fail @ deadbeef", "Red-Proof: real");
    expect(out).toBe("fix: x\n\nRed-Proof: real\n");
  });
  test("proofFiles: tests and the fixtures beside them, deletions ignored", () => {
    const got = proofFiles([
      { status: "A", path: "apps/api/src/a.test.ts" },
      { status: "M", path: "apps/web/src/testing/mock.ts" },
      { status: "D", path: "apps/api/src/old.test.ts" },
      { status: "M", path: "apps/api/src/a.ts" },
    ]);
    expect(got).toEqual({ tests: ["apps/api/src/a.test.ts"], support: ["apps/web/src/testing/mock.ts"] });
  });
});

describe("red proof: bun test output", () => {
  const failing = "(fail) rejects\n\n 1 pass\n 2 fail\n 3 expect() calls\nRan 3 tests across 1 file.";
  test("parses counts and failed tests", () => {
    const r = parseBunTest("(fail) a\n(fail) b\n\n 1 pass\n 1 skip\n 2 fail\n", 1);
    expect(r).toMatchObject({ pass: 1, skip: 1, fail: 2, failedTests: 2, loadErrors: 0 });
  });
  test("a load error is not a failed test", () => {
    const r = parseBunTest("# Unhandled error between tests\nerror: Cannot find module\n\n 0 pass\n 1 fail\n 1 error\n", 1);
    expect(r).toMatchObject({ failedTests: 0, loadErrors: 1, fail: 1 });
  });
  test("green: judge accepts red by assertion then clean green", () => {
    expect(judgeProof("fix", parseBunTest(failing, 1), parseBunTest(" 3 pass\n 0 fail\n", 0))).toEqual({ ok: true });
  });
  test("red: tests already green on the parent", () => {
    const v = judgeProof("fix", parseBunTest(" 3 pass\n 0 fail\n", 0), parseBunTest(" 3 pass\n 0 fail\n", 0));
    expect(v).toMatchObject({ ok: false, kind: "not-red" });
  });
  test("red: a fix whose test only fails to load is not red; a feat's is", () => {
    const load = parseBunTest("# Unhandled error between tests\nerror: x\n\n 0 pass\n 1 fail\n 1 error\n", 1);
    const green = parseBunTest(" 2 pass\n 0 fail\n", 0);
    expect(judgeProof("fix", load, green)).toMatchObject({ ok: false, kind: "not-red" });
    expect(judgeProof("feat", load, green)).toEqual({ ok: true });
  });
  test("red: still failing after the fix", () => {
    expect(judgeProof("fix", parseBunTest(failing, 1), parseBunTest(failing, 1))).toMatchObject({ ok: false, kind: "not-green" });
  });
  test("red: all tests skipped is an error, not green (Postgres down)", () => {
    const skipped = parseBunTest(" 0 pass\n 4 skip\n 0 fail\n", 0);
    expect(judgeProof("fix", skipped, skipped)).toMatchObject({ ok: false, kind: "infra" });
    expect(judgeProof("fix", parseBunTest(failing, 1), skipped)).toMatchObject({ ok: false, kind: "infra" });
  });
});

describe("pre-commit: forbidden paths", () => {
  const f = (path: string, status: StagedFile["status"] = "A"): StagedFile => ({ path, status, content: "x" });
  test("red", () => {
    for (const p of ["COMMITS.md", "docs/COMMITS.md", ".env", "apps/web/.env", ".env.production", "backups/a.dump", "pre-v1.dump", "dump.sql"]) {
      expect(rules(checkForbiddenPaths([f(p)]))).toEqual(["forbidden-path"]);
    }
  });
  test("green: .env.example, nested sql, deleting a forbidden file", () => {
    expect(checkForbiddenPaths([f(".env.example"), f("packages/db/seed/exercises.sql"), f("src/environment.ts")])).toEqual([]);
    expect(checkForbiddenPaths([f(".env", "D")])).toEqual([]);
  });
});

describe("pre-commit: migrations", () => {
  const mig = (name: string, content: string, status: StagedFile["status"] = "A"): StagedFile => ({ path: `packages/db/drizzle/${name}`, status, content });
  const none = new Set<string>();
  test("red: a new migration that drops a column", () => {
    const out = checkMigrations([mig("0099_x.sql", 'ALTER TABLE "a" DROP COLUMN "b";')], none);
    expect(rules(out)).toEqual(["migration-expand-only"]);
  });
  test("red: a new table without RLS", () => {
    const out = checkMigrations([mig("0099_x.sql", 'CREATE TABLE "things" ("id" uuid);')], none);
    expect(rules(out)).toEqual(["migration-rls"]);
  });
  test("red: editing or deleting a released migration", () => {
    const released = new Set(["packages/db/drizzle/0050_old.sql"]);
    expect(rules(checkMigrations([mig("0050_old.sql", "-- tweak", "M")], released))).toEqual(["migration-immutable"]);
    expect(rules(checkMigrations([mig("0050_old.sql", "", "D")], released))).toEqual(["migration-immutable"]);
  });
  test("green: additive migration with RLS, contract with a reason, grandfathered, other files", () => {
    const ok = 'CREATE TABLE "things" ("id" uuid);\nALTER TABLE "things" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "a" ADD COLUMN "c" text;';
    expect(checkMigrations([mig("0099_x.sql", ok)], none)).toEqual([]);
    expect(checkMigrations([mig("0099_x.sql", '-- contract: nothing reads b since v0.1.9\nALTER TABLE "a" DROP COLUMN "b";')], none)).toEqual([]);
    expect(checkMigrations([mig("0010_old.sql", 'DROP TABLE "a";')], none)).toEqual([]);
    expect(checkMigrations([{ path: "packages/db/src/schema.ts", status: "M", content: "DROP TABLE" }], none)).toEqual([]);
  });
  test("green: an unreleased migration may still be edited", () => {
    expect(checkMigrations([mig("0099_x.sql", 'ALTER TABLE "a" ADD COLUMN "c" text;', "M")], new Set(["packages/db/drizzle/0050_old.sql"]))).toEqual([]);
  });
});

describe("pre-commit: Svelte 5 runes", () => {
  test("red: $:, svelte/store, export let", () => {
    expect(rules(checkSvelteRunes("a.svelte", "<script>\n  $: doubled = n * 2;\n</script>"))).toEqual(["runes"]);
    expect(rules(checkSvelteRunes("a.svelte", "import { writable } from 'svelte/store';"))).toEqual(["runes"]);
    expect(rules(checkSvelteRunes("a.svelte", "  export let value = 1;"))).toEqual(["runes"]);
  });
  test("green: runes, a `$:` inside a string, other file types, the inline escape", () => {
    expect(checkSvelteRunes("a.svelte", "<script>\n  let { value = 1 } = $props();\n  const d = $derived(value * 2);\n  const s = 'cost $: 5';\n</script>")).toEqual([]);
    expect(checkSvelteRunes("a.ts", "$: x = 1")).toEqual([]);
    expect(checkSvelteRunes("a.svelte", "$: x = 1 // guard-ok: runes third-party store bridge")).toEqual([]);
  });
});

describe("pre-commit: ratchet on hand-rolled controls and fetch", () => {
  const route = "apps/web/src/routes/clients/+page.svelte";
  const baseline: Baseline = { "raw-btn": { [route]: 1 } };
  test("counts each rule", () => {
    const text = '<select><option/></select>\n<textarea></textarea>\n<input class="input wide">\n<button class="btn btn-primary">\n<div class="panel">';
    expect(countRatchets(route, text)).toEqual({ "raw-select": 1, "raw-textarea": 1, "raw-input": 1, "raw-btn": 1, "raw-panel": 1 });
  });
  test("red: a count above the baseline", () => {
    const text = '<button class="btn">a</button>\n<button class="btn">b</button>';
    expect(rules(checkRatchet([{ path: route, content: text }], baseline))).toEqual(["raw-btn"]);
  });
  test("red: a brand-new file with a raw select", () => {
    expect(rules(checkRatchet([{ path: "apps/web/src/routes/new/+page.svelte", content: "<select></select>" }], baseline))).toEqual(["raw-select"]);
  });
  test("green: at or under baseline, components, escape, lookalike class names", () => {
    expect(checkRatchet([{ path: route, content: '<button class="btn">a</button>' }], baseline)).toEqual([]);
    expect(checkRatchet([{ path: route, content: "" }], baseline)).toEqual([]);
    expect(checkRatchet([{ path: route, content: '<Button class="btn-x"/><div class="panel-head">' }], {})).toEqual([]);
    expect(checkRatchet([{ path: route, content: '<select></select> <!-- guard-ok: raw-controls native picker for a11y test -->' }], {})).toEqual([]);
  });
  test("controls outside routes are not counted", () => {
    expect(countRatchets("apps/web/src/lib/ui/SelectField.svelte", "<select></select>")).toEqual({});
  });
  test("red: fetch( in web source outside the Eden client", () => {
    expect(rules(checkRatchet([{ path: "apps/web/src/lib/x.ts", content: "const r = await fetch('/api/x');" }], {}))).toEqual(["raw-fetch"]);
  });
  test("green: the Eden client, tests, event.fetch, and an escape", () => {
    expect(countRatchets("apps/web/src/lib/api/treaty.ts", "fetch('/x')")).toEqual({});
    expect(countRatchets("apps/web/src/lib/x.test.ts", "fetch('/x')")).toEqual({});
    expect(countRatchets("apps/web/src/lib/x.ts", "await event.fetch('/x'); capturingFetch(a)")).toEqual({});
    expect(countRatchets("apps/web/src/lib/x.ts", "await fetch(url) // guard-ok: eden image bytes, not the API")).toEqual({});
  });
  describe("n-plus-one: an API call per item", () => {
    const page = "apps/web/src/routes/x/+page.svelte";
    const count = (content: string, path = page) => countRatchets(path, content)["n-plus-one"] ?? 0;
    test("red: async map, Promise.all over a map, and a for…of body", () => {
      expect(nPlusOneLines("const rows = await Promise.all(clients.map(async (c) => ({ c, logs: await api.sessionLogs(c.id) })));")).toEqual([1]);
      expect(nPlusOneLines("const all = await Promise.all(ids.map((id) => api.client(id)));")).toEqual([1]);
      expect(nPlusOneLines("await Promise.allSettled(\n  ids.map((id) =>\n    api.snoozeSignal(id)\n  ));")).toEqual([3]);
      expect(nPlusOneLines("for (const c of clients) {\n  const d = await api.client(c.id);\n}")).toEqual([2]);
      expect(nPlusOneLines("for (const c of clients) await adminApi.removeTrainer(c.id);")).toEqual([1]);
      expect(nPlusOneLines("list.forEach(async (c) => { await api.client(c.id); });")).toEqual([1]);
      // promises built now, awaited later; a client behind a property; an unbraced body on one line
      expect(nPlusOneLines("const ps = list.map((c) => api.client(c.id));\nawait Promise.all(ps);")).toEqual([1]);
      expect(nPlusOneLines("rows.filter(ok).map((r) => this.api.sessionLogs(r.id));")).toEqual([1]);
      expect(nPlusOneLines("for (const c of cs) n++;\nawait api.save(1);")).toEqual([]);
    });
    test("red: counted in routes and in pageLoads.ts, so it rides the ratchet", () => {
      const bad = "for (const c of cs) await api.client(c.id);";
      expect(count(bad)).toBe(1);
      expect(count(bad, "apps/web/src/lib/pageLoads.ts")).toBe(1);
      expect(rules(checkRatchet([{ path: page, content: bad }], {}))).toEqual(["n-plus-one"]);
      expect(checkRatchet([{ path: page, content: bad }], { "n-plus-one": { [page]: 1 } })).toEqual([]);
    });
    test("green: one list call, a plain loop, api before the loop, and other files", () => {
      expect(nPlusOneLines("const rows = await api.clientsOverview();\nfor (const r of rows) total += r.logs.length;")).toEqual([]);
      expect(nPlusOneLines("const [a, b] = await Promise.all([api.client(id), api.exercises()]);")).toEqual([]);
      expect(nPlusOneLines("const names = clients.map((c) => c.name);\nawait api.save(names);")).toEqual([]);
      expect(nPlusOneLines("for (const k in obj) {}\nawait api.save(1);")).toEqual([]);
      expect(count("for (const c of cs) await api.client(c.id);", "apps/web/src/lib/x.ts")).toBe(0);
      expect(count("for (const c of cs) await api.client(c.id);", "apps/web/src/routes/x/page.test.ts")).toBe(0);
    });
    test("green: a justified line on the call or on the loop opener", () => {
      expect(nPlusOneLines("for (const c of cs) await api.client(c.id); // guard-ok: n+1 admin sweep")).toEqual([]);
      expect(nPlusOneLines("for (const c of cs) { // guard-ok: n+1 bulk edit of ticked rows\n  await api.client(c.id);\n}")).toEqual([]);
      expect(nPlusOneLines("ids.map(async (id) => {\n  await api.client(id); // guard-ok: n+1 one per ticked row\n});")).toEqual([]);
    });
  });
  test("computeBaseline records today's counts, sorted", () => {
    const b = computeBaseline([
      { path: "apps/web/src/routes/b/+page.svelte", content: '<div class="panel"><div class="panel">' },
      { path: "apps/web/src/routes/a/+page.svelte", content: '<div class="panel">' },
      { path: "apps/web/src/lib/clean.ts", content: "export {}" },
    ]);
    expect(b).toEqual({ "raw-panel": { "apps/web/src/routes/a/+page.svelte": 1, "apps/web/src/routes/b/+page.svelte": 2 } });
  });
});

describe("pre-push: prod dump", () => {
  const day = 86_400_000;
  const base = { dataChanged: true, sinceMs: 10 * day, version: "0.1.54" };
  test("red: migration release, no dump", () => {
    const out = checkReleaseDump({ ...base, dumps: [] });
    expect(rules(out)).toEqual(["release-dump"]);
    expect(out[0].message).toContain("pg_dump");
    expect(out[0].message).toContain("pre-v0.1.54-");
  });
  test("red: only an older dump, or an empty one", () => {
    expect(rules(checkReleaseDump({ ...base, dumps: [{ name: "pre-v0.1.53-x.dump", size: 5, mtimeMs: 9 * day }] }))).toEqual(["release-dump"]);
    expect(rules(checkReleaseDump({ ...base, dumps: [{ name: "pre-v0.1.54-x.dump", size: 0, mtimeMs: 11 * day }] }))).toEqual(["release-dump"]);
  });
  test("green: a fresh non-empty dump, or no data change", () => {
    expect(checkReleaseDump({ ...base, dumps: [{ name: "pre-v0.1.54-x.dump", size: 5, mtimeMs: 11 * day }] })).toEqual([]);
    expect(checkReleaseDump({ ...base, dataChanged: false, dumps: [] })).toEqual([]);
  });
  test("touchesData: drizzle and seeds, not schema code", () => {
    expect(touchesData(["packages/db/drizzle/0073_x.sql"])).toBe(true);
    expect(touchesData(["packages/db/seed/exercises.sql"])).toBe(true);
    expect(touchesData(["packages/db/src/schema.ts", "apps/api/src/a.ts"])).toBe(false);
  });
});

describe("pre-push: release commit shape", () => {
  const head = "a".repeat(40);
  const ok = { subject: "chore: release v0.1.54", headSha: head, tagCommit: head, changelog: "## Unreleased\n\n## v0.1.54\n- a" };
  test("red: untagged release, draft lines left", () => {
    expect(rules(checkReleaseShape({ ...ok, tagCommit: null }))).toEqual(["release-tag"]);
    expect(rules(checkReleaseShape({ ...ok, tagCommit: "b".repeat(40) }))).toEqual(["release-tag"]);
    expect(rules(checkReleaseShape({ ...ok, changelog: "- [draft] a" }))).toEqual(["release-draft"]);
  });
  test("green: a proper release; any other commit is not checked", () => {
    expect(checkReleaseShape(ok)).toEqual([]);
    expect(checkReleaseShape({ ...ok, subject: "fix: a", tagCommit: null, changelog: "[draft]" })).toEqual([]);
  });
});

describe("claude: bash", () => {
  const main: BashContext = { subagent: false, branch: "feat", dirty: false };
  const sub: BashContext = { ...main, subagent: true };
  const block = (cmd: string, ctx = main) => rules(checkBashCommand(cmd, ctx));

  test("red: skipping hooks", () => {
    expect(block("git commit --no-verify -m 'x'")).toEqual(["claude-no-verify"]);
    expect(block("git commit -n -m x")).toEqual(["claude-no-verify"]);
    expect(block("git commit -anm x")).toEqual(["claude-no-verify"]);
    expect(block("git add . && git commit -m x --no-verify")).toEqual(["claude-no-verify"]);
    expect(block("git push --no-verify origin main")).toContain("claude-no-verify");
    expect(block(`bash -c "git commit --no-verify -m x"`)).toEqual(["claude-no-verify"]);
  });
  test("red: rewiring hooks", () => {
    expect(block("git config core.hooksPath /dev/null")).toEqual(["claude-hooks-path"]);
    expect(block("git -c core.hooksPath=/dev/null commit -m x")).toEqual(["claude-hooks-path"]);
  });
  test("green: ordinary commits, and words that merely look like flags", () => {
    expect(block("git commit -m 'fix: a'")).toEqual([]);
    expect(block("git commit -am 'chore: run in -n mode'")).toEqual([]);
    expect(block('git commit -m "build: wire core.hooksPath for guards"')).toEqual([]);
    expect(block("git log --oneline -n 5")).toEqual([]);
    expect(block("git config user.email a@b.c")).toEqual([]);
    expect(commitSkipsHooks(["-m", "msg -n"])).toBe(false);
  });
  test("red: force-push main, hard reset of a dirty main", () => {
    expect(block("git push --force origin main")).toEqual(["claude-force-push"]);
    expect(block("git push -f origin HEAD:main")).toEqual(["claude-force-push"]);
    expect(block("git push --force-with-lease")).toEqual(["claude-force-push"]);
    expect(block("git reset --hard origin/main", { ...main, branch: "main", dirty: true })).toEqual(["claude-reset-hard"]);
  });
  test("green: plain push from the main thread, force-push of a branch, hard reset when clean or elsewhere", () => {
    expect(block("git push origin main")).toEqual([]);
    expect(block("git push --force origin t3/my-branch")).toEqual([]);
    expect(block("git reset --hard HEAD~1", { ...main, branch: "main", dirty: false })).toEqual([]);
    expect(block("git reset --hard HEAD~1", { ...main, branch: "t3/x", dirty: true })).toEqual([]);
  });
  test("red: never-delegate actions inside a subagent", () => {
    expect(block("git push origin main", sub)).toEqual(["claude-subagent-push"]);
    expect(block("bun run release", sub)).toEqual(["claude-subagent-release"]);
    expect(block("bun run scripts/release.ts --current", sub)).toEqual(["claude-subagent-release"]);
    expect(block("pg_dump $DATABASE_URL -Fc -f x.dump", sub)).toEqual(["claude-subagent-pg-dump"]);
    expect(block("cat apps/web/.env", sub)).toEqual(["claude-subagent-env"]);
    expect(block("set -a && source .env.production && set +a", sub)).toEqual(["claude-subagent-env"]);
  });
  test("green: the same commands are the main thread's job; subagents may read .env.example and test release-lib", () => {
    expect(block("bun run release")).toEqual([]);
    expect(block("pg_dump x")).toEqual([]);
    expect(block("cat apps/web/.env")).toEqual([]);
    expect(block("cat .env.example", sub)).toEqual([]);
    expect(block("bun test scripts/release-lib.test.ts", sub)).toEqual([]);
    expect(block("git status 2>&1 | head", sub)).toEqual([]);
  });
  test("segments keep a redirect and quoted separators whole", () => {
    expect(segments("a 2>&1 | b")).toEqual([["a", "2>&1"], ["b"]]);
    expect(segments("git commit -m 'a; b' && x")).toEqual([["git", "commit", "-m", "a; b"], ["x"]]);
  });
});

describe("claude: edit/write paths", () => {
  const released = new Set(["packages/db/drizzle/0050_old.sql"]);
  test("red", () => {
    expect(rules(checkClaudePath("COMMITS.md", released))).toEqual(["claude-path"]);
    expect(rules(checkClaudePath("apps/web/.env", released))).toEqual(["claude-path"]);
    expect(rules(checkClaudePath(".env.production", released))).toEqual(["claude-path"]);
    expect(rules(checkClaudePath("packages/db/drizzle/0050_old.sql", released))).toEqual(["claude-path"]);
  });
  test("green", () => {
    expect(checkClaudePath(".env.example", released)).toEqual([]);
    expect(checkClaudePath("packages/db/drizzle/0099_new.sql", released)).toEqual([]);
    expect(checkClaudePath("apps/api/src/a.ts", released)).toEqual([]);
  });
});

describe("claude: svelte feedback", () => {
  test("red: names the violation", () => {
    const msg = svelteFeedback("apps/web/src/routes/a/+page.svelte", "$: x = 1\n<select></select>", {});
    expect(msg).toContain("legacy reactivity");
    expect(msg).toContain("native <select>");
  });
  test("green: clean file gives nothing", () => {
    expect(svelteFeedback("apps/web/src/routes/a/+page.svelte", "<script>let { a } = $props();</script>", {})).toBeNull();
  });
});
