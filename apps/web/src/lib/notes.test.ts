import { describe, expect, test } from "bun:test";
import { textAnchor } from "./notes";

describe("textAnchor", () => {
  test("exact quote → source offsets", () => {
    const content = "Keep squats at RPE 8. Add face pulls.";
    expect(textAnchor(content, " RPE 8. ")).toEqual({ type: "text", quote: "RPE 8.", start: 15, end: 21 });
  });
  test("line breaks in the source still map back", () => {
    const content = "Keep squats\nat RPE 8.";
    const a = textAnchor(content, "squats at RPE")!;
    expect(content.slice(a.start, a.end)).toBe("squats\nat RPE");
  });
  test("rendered-only text falls back to 0..length; tiny selections are ignored", () => {
    expect(textAnchor("**bold** move", "bold move")).toEqual({ type: "text", quote: "bold move", start: 0, end: 9 });
    expect(textAnchor("abc", " a ")).toBeNull();
  });
});
