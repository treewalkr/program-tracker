import { describe, expect, test } from "bun:test";
import { emailPreviews } from "./lib/email-previews";

describe("email previews", () => {
  const previews = emailPreviews("https://app.test");

  test("one preview per variant, each fully rendered", () => {
    expect(previews.map((p) => p.id)).toEqual([
      "created-page",
      "created-general",
      "reply",
      "status-accepted",
      "status-wontfix",
      "status-done",
    ]);
    for (const p of previews) {
      expect(p.email.subject).toStartWith("[FB-042]");
      expect(p.email.html).toContain("https://app.test/feedback#FB-042");
      expect(p.email.text).toContain("Unsubscribe from all: https://app.test/v1/email/unsubscribe?t=preview&scope=all");
      expect(p.email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    }
  });

  test("variants differ where the templates branch", () => {
    const by = Object.fromEntries(previews.map((p) => [p.id, p.email]));
    expect(by["created-page"].text).toContain("left feedback on /clients/abc:");
    expect(by["created-general"].text).toContain("filed a ticket:");
    expect(by["status-wontfix"].text).toContain("Reason: Supersets");
    expect(by["status-done"].subject).toContain("Shipped in v0.1.3");
    expect(by["created-page"].to).toBe("admin@example.com");
    expect(by["status-accepted"].to).toBe("sam@example.com");
  });
});
