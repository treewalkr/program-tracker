/**
 * Color theme: the trainer's pick (system / light / dark), remembered per browser.
 * The resolved theme lands on `<html data-theme>`; app.css keys the dark tokens off it.
 * app.html runs the same resolution inline before first paint so a reload never flashes.
 */

export type ThemePref = "system" | "light" | "dark";

const KEY = "pt.theme";
const ORDER: ThemePref[] = ["system", "light", "dark"];
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function read(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

let pref = $state<ThemePref>(read());
let systemDark = $state(darkQuery.matches);

darkQuery.addEventListener("change", (e) => (systemDark = e.matches));

export const theme = {
  get pref() {
    return pref;
  },
  get resolved(): "light" | "dark" {
    return pref === "system" ? (systemDark ? "dark" : "light") : pref;
  },
  set(next: ThemePref) {
    pref = next;
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  },
  /** System → Light → Dark → System. */
  cycle() {
    theme.set(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]);
  },
};

/** Keep `<html data-theme>` in step with the pick and the OS setting. Call once from the root layout. */
export function syncThemeAttribute() {
  $effect(() => {
    document.documentElement.dataset.theme = theme.resolved;
  });
}
