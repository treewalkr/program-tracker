import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import { LOGIN_ACCENTS, LOGIN_VARIANTS, type LoginTheme } from "@pt/shared";
import LoginView from "./LoginView.svelte";

const href = "/v1/auth/google?returnTo=%2Fclients";
const html = (theme: LoginTheme, error: string | null = null) => render(LoginView, { props: { theme, href, error } }).body;

describe("login layouts", () => {
  test.each([...LOGIN_VARIANTS])("%s: one heading, the Google link, no error by default", (variant) => {
    const body = html({ variant, accent: "green" });
    expect(body).toContain(`data-variant="${variant}"`);
    expect(body.match(/<h1/g)).toHaveLength(1);
    expect(body).toContain(`href="${href}"`);
    expect(body).toContain("Continue with Google");
    expect(body).not.toContain('role="alert"');
  });

  test.each([...LOGIN_VARIANTS])("%s: shows the sign-in error as an alert", (variant) => {
    const body = html({ variant, accent: "green" }, "Sign-in was cancelled before Google finished.");
    expect(body).toContain('role="alert"');
    expect(body).toContain("Sign-in was cancelled before Google finished.");
  });

  test("the accent lands on the wrapper for every layout", () => {
    for (const variant of LOGIN_VARIANTS)
      for (const accent of LOGIN_ACCENTS) expect(html({ variant, accent })).toContain(`data-accent="${accent}"`);
  });

  test("classic is today's page: PT mark, a four-week block, invite-only copy and the session note", () => {
    const body = html({ variant: "classic", accent: "green" });
    expect(body).toContain(">PT</span>");
    expect(body.match(/class="day/g)).toHaveLength(28);
    expect(body).toContain("Sign in to your workspace");
    expect(body).toContain("Program Tracker is invite-only.");
    expect(body).toContain("Sessions last 30 days on this device.");
  });

  test("split and bold draw a twelve-week season; minimal a single week", () => {
    expect(html({ variant: "split", accent: "blue" }).match(/class="day/g)).toHaveLength(84);
    expect(html({ variant: "bold", accent: "blue" }).match(/class="day/g)).toHaveLength(84);
    expect(html({ variant: "minimal", accent: "blue" }).match(/class="day/g)).toHaveLength(7);
  });

  test("the heatmaps are decorative — hidden from assistive tech", () => {
    for (const variant of LOGIN_VARIANTS) {
      const body = html({ variant, accent: "green" });
      expect(body).toMatch(/class="block[^"]*"[^>]*aria-hidden="true"/);
    }
  });
});
