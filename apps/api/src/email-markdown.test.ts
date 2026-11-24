import { describe, expect, test } from "bun:test";
import { markdownEmailHtml, markdownEmailText } from "./lib/email-markdown";

const reply = [
  "Fixed in `activeWeek` — **pull to refresh**:",
  "",
  "```ts",
  "const week = 1;",
  "```",
  "",
  "See [the PR](https://x.test/pr/1) or https://x.test/long",
].join("\n");

describe("markdownEmailHtml", () => {
  test("renders a reply like the app: code, bold, links — inline-styled and wrapping", () => {
    const html = markdownEmailHtml(reply);
    expect(html).toContain("<strong>pull to refresh</strong>");
    expect(html).toMatch(/<code class="pt-code" style="[^"]*">activeWeek<\/code>/);
    expect(html).toMatch(/<pre class="pt-code" style="[^"]*white-space:pre-wrap;overflow-wrap:anywhere[^"]*"><code>const week = 1;<\/code><\/pre>/);
    expect(html).toContain('href="https://x.test/pr/1"');
    expect(html).not.toContain("```");
    expect(html).not.toContain("**");
  });

  test("raw HTML is shown as text and unsafe links lose their href", () => {
    const html = markdownEmailHtml('<img src=x onerror=alert(1)> [x](javascript:alert(1)) ![a](https://t.test/i.png)');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("https://t.test/i.png");
  });
});

describe("markdownEmailText", () => {
  test("drops the reading marks, keeps code lines and link addresses", () => {
    expect(markdownEmailText(reply).split("\n")).toEqual([
      "Fixed in activeWeek — pull to refresh:",
      "",
      "    const week = 1;",
      "",
      "See the PR (https://x.test/pr/1) or https://x.test/long",
    ]);
  });
});
