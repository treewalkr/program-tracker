import { describe, expect, test } from "bun:test";
import { clearDraft, readDraft, writeDraft } from "./localDraft";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

describe("localDraft", () => {
  test("round-trips data with its save time", () => {
    const s = mem();
    const at = writeDraft("k", { name: "Base B", sessions: [1, 2] }, s, new Date("2026-11-07T10:00:00Z"));
    expect(at).toBe("2026-11-07T10:00:00.000Z");
    expect(readDraft("k", s)).toEqual({ savedAt: at!, data: { name: "Base B", sessions: [1, 2] } });
  });

  test("missing, corrupt or old-version entries read as none", () => {
    const s = mem();
    expect(readDraft("k", s)).toBeNull();
    s.setItem("k", "{oops");
    expect(readDraft("k", s)).toBeNull();
    s.setItem("k", JSON.stringify({ v: 0, savedAt: "x", data: {} }));
    expect(readDraft("k", s)).toBeNull();
  });

  test("clear removes it; a full store doesn't throw", () => {
    const s = mem();
    writeDraft("k", 1, s);
    clearDraft("k", s);
    expect(readDraft("k", s)).toBeNull();
    const full = { ...s, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(writeDraft("k", 1, full)).toBeNull();
  });
});
