/**
 * Color theme: the trainer's mode (system / light / dark) plus one palette per mode,
 * remembered per browser. The resolved mode lands on `<html data-theme>` and the resolved
 * palette on `<html data-palette>`; app.css keys its tokens off both.
 * app.html runs the same resolution inline before first paint so a reload never flashes.
 */

export type ThemePref = "system" | "light" | "dark";
export type Mode = "light" | "dark";

export type Palette = {
  id: string;
  label: string;
  mode: Mode;
  /** Swatch colours for the picker: canvas, ink, action green, signal (red, or blue in colourblind). */
  swatch: { bg: string; ink: string; good: string; bad: string };
};

export const PALETTES = [
  { id: "light", label: "Light", mode: "light", swatch: { bg: "#ffffff", ink: "#1f2328", good: "#1f883d", bad: "#cf222e" } },
  { id: "light-hc", label: "High contrast", mode: "light", swatch: { bg: "#ffffff", ink: "#010409", good: "#055d20", bad: "#a0111f" } },
  { id: "light-cb", label: "Colourblind", mode: "light", swatch: { bg: "#ffffff", ink: "#1f2328", good: "#0969da", bad: "#bc4c00" } },
  { id: "paper", label: "Paper", mode: "light", swatch: { bg: "#f7f1e3", ink: "#3b2f22", good: "#2f6f3a", bad: "#a8321f" } },
  { id: "dark", label: "Dark", mode: "dark", swatch: { bg: "#0d1117", ink: "#f0f6fc", good: "#238636", bad: "#f85149" } },
  { id: "dark-dimmed", label: "Dimmed", mode: "dark", swatch: { bg: "#212830", ink: "#d1d7e0", good: "#347d39", bad: "#e5534b" } },
  { id: "dark-hc", label: "High contrast", mode: "dark", swatch: { bg: "#010409", ink: "#ffffff", good: "#09b43a", bad: "#ff6a69" } },
  { id: "dark-cb", label: "Colourblind", mode: "dark", swatch: { bg: "#0d1117", ink: "#f0f6fc", good: "#1f6feb", bad: "#f0883e" } },
] as const satisfies readonly Palette[];

export type PaletteId = (typeof PALETTES)[number]["id"];

const KEY = "pt.theme";
const PALETTE_KEY: Record<Mode, string> = { light: "pt.theme.light", dark: "pt.theme.dark" };
const ORDER: ThemePref[] = ["system", "light", "dark"];
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function read(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function readPalette(mode: Mode): PaletteId {
  const v = localStorage.getItem(PALETTE_KEY[mode]);
  return PALETTES.find((p) => p.id === v && p.mode === mode)?.id ?? mode;
}

function writePalette(mode: Mode, id: PaletteId) {
  if (id === mode) localStorage.removeItem(PALETTE_KEY[mode]);
  else localStorage.setItem(PALETTE_KEY[mode], id);
}

let pref = $state<ThemePref>(read());
let systemDark = $state(darkQuery.matches);
let lightTheme = $state<PaletteId>(readPalette("light"));
let darkTheme = $state<PaletteId>(readPalette("dark"));

darkQuery.addEventListener("change", (e) => (systemDark = e.matches));

export const theme = {
  get pref() {
    return pref;
  },
  get resolved(): Mode {
    return pref === "system" ? (systemDark ? "dark" : "light") : pref;
  },
  get lightTheme() {
    return lightTheme;
  },
  get darkTheme() {
    return darkTheme;
  },
  /** The palette in use right now: the light or dark pick, by resolved mode. */
  get palette(): PaletteId {
    return theme.resolved === "dark" ? darkTheme : lightTheme;
  },
  set(next: ThemePref) {
    pref = next;
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  },
  setLight(id: PaletteId) {
    lightTheme = id;
    writePalette("light", id);
  },
  setDark(id: PaletteId) {
    darkTheme = id;
    writePalette("dark", id);
  },
  /** System → Light → Dark → System. */
  cycle() {
    theme.set(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]);
  },
};

/** Keep `<html data-theme>` and `<html data-palette>` in step with the picks and the OS setting. Call once from the root layout. */
export function syncThemeAttribute() {
  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme.resolved;
    root.dataset.palette = theme.palette;
  });
}
