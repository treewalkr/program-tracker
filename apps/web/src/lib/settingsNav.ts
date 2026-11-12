import type { IconName } from "./ui/Icon.svelte";
import type { Session } from "./api/auth";

/** One settings page: its rail entry and the line under the Settings title. */
export type SettingsSection = { href: string; label: string; icon: IconName; sub: string };
/** A rail group; `label: null` is the unlabelled foot (About). */
export type SettingsGroup = { label: string | null; note?: string; items: SettingsSection[] };

const YOU: SettingsGroup = {
  label: "You",
  items: [
    { href: "/settings", label: "Appearance", icon: "sun", sub: "Light or dark, and the palette for each" },
    {
      href: "/settings/notifications",
      label: "Notifications",
      icon: "bell",
      sub: "Which feedback emails you get, and tickets you've muted",
    },
    { href: "/settings/coaching", label: "Coaching", icon: "trending", sub: "What a deload week does for every client" },
  ],
};

/** Workspace-wide settings; only admins see them, and the API enforces it too. */
const WORKSPACE: SettingsGroup = {
  label: "Workspace",
  note: "Admin",
  items: [
    {
      href: "/settings/login-page",
      label: "Login page",
      icon: "monitor",
      sub: "What trainers see before they sign in — the layout and its accent",
    },
    {
      href: "/settings/ai",
      label: "AI answers",
      icon: "sparkle",
      sub: "How the feedback agent replies, and what the AI log has collected",
    },
  ],
};

const ABOUT: SettingsGroup = {
  label: null,
  items: [{ href: "/settings/about", label: "About", icon: "pulse", sub: "This app's version and its API" }],
};

/** AUTH_DISABLED ("open") runs as admin server-side too. */
export function isAdminSession(session: Session): boolean {
  return session.kind === "open" || (session.kind === "signedIn" && session.trainer.isAdmin);
}

/** The rail's groups. Trainers see their own settings; admins also see the workspace's. */
export function settingsGroups(isAdmin: boolean): SettingsGroup[] {
  return [YOU, ...(isAdmin && WORKSPACE.items.length ? [WORKSPACE] : []), ABOUT];
}

/** The section the path is on; unknown paths fall back to the first one. */
export function activeSection(groups: SettingsGroup[], pathname: string): SettingsSection {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const all = groups.flatMap((g) => g.items);
  return all.find((s) => s.href === path) ?? all[0];
}
