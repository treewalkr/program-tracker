import { describe, expect, it } from "vitest";
import { noteFor, RELEASE_NOTES } from "./releaseNote";

describe("noteFor", () => {
  const notes = [{ version: "1.0.0", copy: { en: { title: "a", points: [] }, th: { title: "ก", points: [] } } }];
  it("finds the note for the latest version", () => expect(noteFor("1.0.0", notes)?.version).toBe("1.0.0"));
  it("is null when the latest release has no note", () => expect(noteFor("1.0.1", notes)).toBeNull());
  it("is null when nothing is released", () => expect(noteFor(null, notes)).toBeNull());
  it("every shipped note has both languages", () => {
    for (const n of RELEASE_NOTES) {
      expect(n.copy.en.title && n.copy.th.title).toBeTruthy();
      expect(n.copy.en.points.length).toBe(n.copy.th.points.length);
    }
  });
});
