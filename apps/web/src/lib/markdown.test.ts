import { describe, expect, test } from "bun:test";
import { renderSafeMarkdown } from "./markdown";

describe("renderSafeMarkdown", () => {
  test("renders ordinary markdown", () => {
    const html = renderSafeMarkdown("Open **Settings** → *Email*.\n\n- one\n- two");
    expect(html).toContain("<strong>Settings</strong>");
    expect(html).toContain("<em>Email</em>");
    expect(html).toContain("<li>one</li>");
  });
  test("escapes raw HTML, block and inline", () => {
    const html = renderSafeMarkdown('<script>alert(1)</script>\n\nhi <img src=x onerror="alert(1)"> there');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
  test("keeps safe links, drops script and data links", () => {
    expect(renderSafeMarkdown("[docs](https://pt.pinroj.com/x)")).toContain('<a href="https://pt.pinroj.com/x"');
    expect(renderSafeMarkdown("[settings](/settings)")).toContain('<a href="/settings"');
    const bad = renderSafeMarkdown("[click](javascript:alert(1)) [d](data:text/html,x) [p](//evil.test)");
    expect(bad).not.toContain("<a");
    expect(bad).toContain("click");
  });
  test("drops images, keeping the alt text", () => {
    const html = renderSafeMarkdown("![a screenshot](https://evil.test/track.png)");
    expect(html).not.toContain("<img");
    expect(html).toContain("a screenshot");
  });
  test("escapes quotes in link titles", () => {
    expect(renderSafeMarkdown('[x](https://a.test "say \\"hi\\"")')).not.toMatch(/title="say "hi""/);
  });
  test("empty in, empty out", () => {
    expect(renderSafeMarkdown(null)).toBe("");
  });
});
