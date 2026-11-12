import type { IconName } from "./ui/Icon.svelte";

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

const ABOUT: SettingsGroup = {
  label: null,
  items: [{ href: "/settings/about", label: "About", icon: "pulse", sub: "This app's version and its API" }],
};

/** The rail's groups. Trainers see their own settings; admins also see the workspace's. */
export function settingsGroups(): SettingsGroup[] {
  return [YOU, ABOUT];
}

/** The section the path is on; unknown paths fall back to the first one. */
export function activeSection(groups: SettingsGroup[], pathname: string): SettingsSection {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const all = groups.flatMap((g) => g.items);
  return all.find((s) => s.href === path) ?? all[0];
}
