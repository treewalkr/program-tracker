import { describe, expect, test } from "bun:test";
import { clearGenerateBrief, generateBriefKey, handoffOf, initialBrief, readGenerateBrief, saveGenerateBrief } from "./generateBrief";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

describe("generateBrief", () => {
  test("keys are per client", () => {
    expect(generateBriefKey("cl-maya")).toBe("pt.generateBrief.cl-maya");
    expect(generateBriefKey("a")).not.toBe(generateBriefKey("b"));
  });

  test("round-trips the brief and the rules turned on", () => {
    const s = mem();
    const k = generateBriefKey("cl-maya");
    const b = { instructions: "Single-leg work; travels Thu–Sun.", selected: ["builtin:effort", "t1"], handoff: "" };
    saveGenerateBrief(k, b, s);
    expect(readGenerateBrief(k, s)).toEqual(b);
  });

  test("a rule alone is worth keeping", () => {
    const s = mem();
    const k = generateBriefKey("c");
    saveGenerateBrief(k, { instructions: "", selected: ["t1"] }, s);
    expect(readGenerateBrief(k, s)).toEqual({ instructions: "", selected: ["t1"], handoff: "" });
  });

  test("an empty form removes the key", () => {
    const s = mem();
    const k = generateBriefKey("c");
    saveGenerateBrief(k, { instructions: "x", selected: [] }, s);
    saveGenerateBrief(k, { instructions: "  ", selected: [] }, s);
    expect(s.m.has(k)).toBe(false);
  });

  test("clear removes it", () => {
    const s = mem();
    const k = generateBriefKey("c");
    saveGenerateBrief(k, { instructions: "x", selected: [] }, s);
    clearGenerateBrief(k, s);
    expect(readGenerateBrief(k, s)).toBeNull();
  });

  test("corrupt or mis-shaped entries read as none and are removed", () => {
    const s = mem();
    s.setItem("a", "{oops");
    expect(readGenerateBrief("a", s)).toBeNull();
    expect(s.m.has("a")).toBe(false);
    s.setItem("b", JSON.stringify({ v: 1, savedAt: "x", data: { instructions: 3, selected: [] } }));
    expect(readGenerateBrief("b", s)).toBeNull();
    s.setItem("c", JSON.stringify({ v: 1, savedAt: "x", data: { instructions: "", selected: [1] } }));
    expect(readGenerateBrief("c", s)).toBeNull();
  });

  test("no storage is a no-op", () => {
    expect(readGenerateBrief("k", null)).toBeNull();
    expect(() => saveGenerateBrief("k", { instructions: "x", selected: [] }, null)).not.toThrow();
  });

  describe("initialBrief", () => {
    const known = (id: string) => id !== "gone";
    const none = { note: null, tpl: null };

    test("no saved brief and no handoff: empty", () => {
      expect(initialBrief(null, none, known)).toEqual({ instructions: "", selected: [], handoff: "" });
    });

    test("restores the saved brief, dropping rules that no longer exist", () => {
      const saved = { instructions: "Hips", selected: ["t1", "gone"], handoff: "" };
      expect(initialBrief(saved, none, known)).toEqual({ instructions: "Hips", selected: ["t1"], handoff: "" });
    });

    test("a handoff fills the form when nothing was saved from it", () => {
      const h = { note: "Deload", tpl: "t2" };
      expect(initialBrief(null, h, known)).toEqual({ instructions: "Deload", selected: ["t2"], handoff: handoffOf("Deload", "t2") });
      expect(initialBrief(null, { note: null, tpl: "gone" }, known).selected).toEqual([]);
    });

    test("a new handoff isn't masked by an older saved brief", () => {
      const saved = { instructions: "Old", selected: ["t1"], handoff: "" };
      expect(initialBrief(saved, { note: "Deload", tpl: null }, known).instructions).toBe("Deload");
    });

    test("Back to the same handoff URL keeps the trainer's edits", () => {
      const h = { note: "Deload", tpl: "t2" };
      const saved = { instructions: "Deload, and no jumps", selected: ["t2", "t1"], handoff: handoffOf("Deload", "t2") };
      expect(initialBrief(saved, h, known)).toEqual(saved);
    });
  });
});
