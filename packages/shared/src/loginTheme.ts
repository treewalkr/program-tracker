/**
 * The login page's look, picked by the platform admin: one of a few built-in
 * layouts plus an accent from fixed, contrast-checked swatches. No free copy
 * or hex — every combination is designed and safe.
 */

export const LOGIN_VARIANTS = ["classic", "split", "bold", "minimal"] as const;
export type LoginVariant = (typeof LOGIN_VARIANTS)[number];

export const LOGIN_ACCENTS = ["green", "blue", "purple", "orange"] as const;
export type LoginAccent = (typeof LOGIN_ACCENTS)[number];

export interface LoginTheme {
  variant: LoginVariant;
  accent: LoginAccent;
}

/** Today's page: the centered card on the green training ramp. */
export const DEFAULT_LOGIN_THEME: LoginTheme = { variant: "classic", accent: "green" };

/** Picker copy for each layout. */
export const LOGIN_VARIANT_INFO: Record<LoginVariant, { label: string; blurb: string }> = {
  classic: { label: "Classic", blurb: "Centered card with the training block." },
  split: { label: "Split", blurb: "Training history on the left, sign-in on the right." },
  bold: { label: "Bold", blurb: "Dark, full-bleed, big type." },
  minimal: { label: "Minimal", blurb: "Just the headline and the button." },
};

/**
 * Each accent: `solid` carries white text (≥ 4.5:1, checked in tests) and
 * `ramp` is the four heatmap steps, lightest first. Green is the app's own
 * ramp — on screen it follows the trainer's palette tokens (--done-1…4).
 */
export const LOGIN_ACCENT_SWATCHES: Record<LoginAccent, { label: string; solid: string; ramp: [string, string, string, string] }> = {
  green: { label: "Green", solid: "#1a7f37", ramp: ["#aceebb", "#4ac26b", "#2da44e", "#116329"] },
  blue: { label: "Blue", solid: "#0969da", ramp: ["#b6e3ff", "#54aeff", "#0969da", "#0a3069"] },
  purple: { label: "Purple", solid: "#8250df", ramp: ["#d8b9ff", "#a475f9", "#8250df", "#3e1f79"] },
  orange: { label: "Orange", solid: "#bc4c00", ramp: ["#ffb77c", "#fb8f44", "#bc4c00", "#762c00"] },
};

export const isLoginVariant = (v: unknown): v is LoginVariant =>
  typeof v === "string" && (LOGIN_VARIANTS as readonly string[]).includes(v);

export const isLoginAccent = (v: unknown): v is LoginAccent =>
  typeof v === "string" && (LOGIN_ACCENTS as readonly string[]).includes(v);

/** Any stored value → a valid theme; each unknown or missing field falls back to the default. */
export function parseLoginTheme(raw: unknown): LoginTheme {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    variant: isLoginVariant(o.variant) ? o.variant : DEFAULT_LOGIN_THEME.variant,
    accent: isLoginAccent(o.accent) ? o.accent : DEFAULT_LOGIN_THEME.accent,
  };
}

/** WCAG 2 contrast ratio between two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
