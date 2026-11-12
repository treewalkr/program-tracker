import { describe, expect, test } from "bun:test";
import type { Session } from "$lib/api/auth";
import { activeSection, isAdminSession, settingsGroups } from "./settingsNav";

const trainer = (isAdmin: boolean): Session =>
  ({ kind: "signedIn", trainer: { id: "t1", name: "Kai", email: "kai@x.test", avatarUrl: null, isAdmin } }) as Session;

describe("settings nav", () => {
  test("admins and open (auth disabled) sessions count as admin", () => {
    expect(isAdminSession(trainer(true))).toBe(true);
    expect(isAdminSession({ kind: "open" })).toBe(true);
    expect(isAdminSession(trainer(false))).toBe(false);
    expect(isAdminSession({ kind: "signedOut" })).toBe(false);
  });

  test("the workspace group is admin-only", () => {
    const hrefs = (admin: boolean) => settingsGroups(admin).flatMap((g) => g.items.map((s) => s.href));
    const workspace = ["/settings/login-page", "/settings/ai", "/settings/email-templates"];
    expect(settingsGroups(false).map((g) => g.label)).toEqual(["You", null]);
    for (const href of workspace) expect(hrefs(false)).not.toContain(href);
    expect(settingsGroups(true).map((g) => g.label)).toEqual(["You", "Workspace", null]);
    for (const href of workspace) expect(hrefs(true)).toContain(href);
  });

  test("the active section follows the path, trailing slash or not", () => {
    const groups = settingsGroups(true);
    expect(activeSection(groups, "/settings").label).toBe("Appearance");
    expect(activeSection(groups, "/settings/notifications/").label).toBe("Notifications");
    expect(activeSection(groups, "/settings/email-templates").label).toBe("Email templates");
    expect(activeSection(groups, "/settings/nope").label).toBe("Appearance");
  });
});
