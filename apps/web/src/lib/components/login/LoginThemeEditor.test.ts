import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import type { LoginTheme } from "@pt/shared";
import LoginThemeEditor from "./LoginThemeEditor.svelte";

const html = (saved: LoginTheme, canSave = true) =>
  render(LoginThemeEditor, { props: { saved, canSave, onsave: async (t: LoginTheme) => t } }).body;

describe("login theme editor", () => {
  test("starts on the saved theme: its layout and accent checked and marked live", () => {
    const body = html({ variant: "bold", accent: "orange" });
    expect(body).toMatch(/name="login-variant" value="bold" checked/);
    expect(body).toMatch(/name="login-accent" value="orange" checked/);
    expect(body.match(/checked/g)).toHaveLength(2);
    expect(body).toMatch(/Bold\s*(<!--[^>]*-->)?<span class="live[^"]*">Live<\/span>/);
    expect(body.match(/>Live<\/span>/g)).toHaveLength(1);
    expect(body).toContain("Live on the login page");
  });

  test("offers every layout and accent", () => {
    const body = html({ variant: "classic", accent: "green" });
    for (const name of ["Classic", "Split", "Bold", "Minimal", "Green", "Blue", "Purple", "Orange"]) expect(body).toContain(name);
  });

  test("the preview renders the real layout, inert, at desktop size", () => {
    const body = html({ variant: "split", accent: "purple" });
    expect(body).toMatch(/class="screen[^"]*" inert/);
    expect(body).toContain('data-variant="split"');
    expect(body).toContain('data-accent="purple"');
    expect(body).toContain("Preview of the split login page, desktop size");
    // the preview is a picture: its sign-in link goes nowhere new
    expect(body).toContain('href="/login"');
  });

  test("Save is off until something changes", () => {
    expect(html({ variant: "classic", accent: "green" })).toMatch(/<button class="btn primary" disabled="">(\s|<!--[^>]*-->)*Save/);
  });

  test("demo mode is preview only", () => {
    const body = html({ variant: "classic", accent: "green" }, false);
    expect(body).toContain("Preview only in demo mode");
    expect(body).toMatch(/<button class="btn primary" disabled="">(\s|<!--[^>]*-->)*Save/);
  });
});
