import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import { settingsGroups } from "$lib/settingsNav";
import SettingsRail from "./SettingsRail.svelte";

const html = (admin: boolean, current = "/settings") =>
  render(SettingsRail, { props: { groups: settingsGroups(admin), current } }).body;

describe("settings rail", () => {
  test("trainers don't see the workspace section", () => {
    const body = html(false);
    expect(body).not.toContain("Workspace");
    expect(body).not.toContain('href="/settings/login-page"');
    expect(body).not.toContain('href="/settings/ai"');
    expect(body).not.toContain('href="/settings/email-templates"');
    for (const href of ["/settings", "/settings/notifications", "/settings/coaching", "/settings/about"])
      expect(body).toContain(`href="${href}"`);
  });

  test("admins see the workspace section, marked as admin", () => {
    const body = html(true);
    expect(body).toContain("Workspace");
    expect(body).toMatch(/<span class="note[^"]*">Admin<\/span>/);
    for (const href of ["/settings/login-page", "/settings/ai", "/settings/email-templates"]) expect(body).toContain(`href="${href}"`);
  });

  test("only the current page is marked", () => {
    const body = html(true, "/settings/ai");
    expect(body.match(/aria-current="page"/g)).toHaveLength(1);
    expect(body).toMatch(/href="\/settings\/ai"[^>]*aria-current="page"/);
  });
});
