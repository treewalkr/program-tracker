import { describe, expect, test } from "bun:test";
import { emptyProfile } from "./clientProfile";
import { clearAllNewClientDrafts, newClientDraftKey, readNewClientDraft, saveNewClientDraft } from "./newClientDraft";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    m,
  };
};

describe("newClientDraft", () => {
  test("keys are scoped by mode and trainer", () => {
    expect(newClientDraftKey("mock", null)).toBe("pt.newClientDraft.mock.open");
    expect(newClientDraftKey("live", "t1")).toBe("pt.newClientDraft.live.t1");
  });

  test("round-trips a touched form; empty form removes the key", () => {
    const s = mem();
    const k = newClientDraftKey("mock", null);
    const d = { name: "Ana", email: "", phone: "+66 81 234 5678", profile: { ...emptyProfile(), goals: "Run 10k" } };
    saveNewClientDraft(k, d, s);
    expect(readNewClientDraft(k, s)).toEqual(d);
    saveNewClientDraft(k, { name: " ", email: "", phone: " ", profile: emptyProfile() }, s);
    expect(s.m.has(k)).toBe(false);
  });

  test("corrupt or mis-shaped drafts are ignored and removed", () => {
    const s = mem();
    s.setItem("a", "{oops");
    expect(readNewClientDraft("a", s)).toBeNull();
    expect(s.m.has("a")).toBe(false);
    s.setItem("b", JSON.stringify({ v: 1, savedAt: "x", data: { name: "A", email: "", profile: { goals: 1 } } }));
    expect(readNewClientDraft("b", s)).toBeNull();
    expect(s.m.has("b")).toBe(false);
  });

  test("a draft saved before the basics fields still restores, merged over an empty profile", () => {
    const s = mem();
    const old = {
      sessionsPerWeek: 4,
      trainingDays: [1, 3],
      cardioDays: [],
      longRunDay: null,
      oneRepMaxes: [{ exerciseId: "ex-squat", kg: 100, date: "2026-10-01" }],
      cardioUnit: "none",
      cardioValue: 120,
      goals: "Run 10k",
      limitations: "",
    };
    s.setItem("old", JSON.stringify({ v: 1, savedAt: "x", data: { name: "Ana", email: "", profile: old } }));
    const restored = readNewClientDraft("old", s);
    expect(restored?.name).toBe("Ana");
    expect(restored?.phone).toBe("");
    expect(restored?.profile).toEqual({ ...emptyProfile(), ...old } as typeof restored.profile);
    expect(restored?.profile).toMatchObject({ experience: "", birthDate: "", sex: "", bodyweightKg: null, heightCm: null });
  });

  test("sign-out clears every new-client draft and nothing else", () => {
    const s = mem();
    s.setItem("pt.newClientDraft.mock.open", "x");
    s.setItem("pt.newClientDraft.live.t1", "x");
    s.setItem("other", "x");
    clearAllNewClientDrafts(s);
    expect([...s.m.keys()]).toEqual(["other"]);
  });
});
