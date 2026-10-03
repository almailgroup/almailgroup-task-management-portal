import type { TranslationKey } from "@/lib/i18n";

/**
 * The themes a person can choose, and the one fact the code needs about
 * each: whether it is light or dark.
 *
 * Each theme's colours live in globals.css as a block of tokens under its own
 * class. This list is the other half — the picker's order, the labels, the
 * swatch it draws — and a unit test holds the two to each other, so a theme
 * cannot be offered without colours or coloured without being offered.
 *
 * Light and Dark are the house style: monochrome, nothing saturated. The
 * others tint the surfaces or the main action, and nothing else. Amber means
 * late or urgent work in every one of them, which is why no theme here is
 * warm enough to be confused with it.
 */
export type ThemeMode = "light" | "dark";

export type ThemeOption = {
  id: string;
  mode: ThemeMode;
  label: TranslationKey;
  /** What the picker draws: the page, a card on it, and the main action. */
  swatch: { ground: string; card: string; accent: string };
};

export const THEMES: readonly ThemeOption[] = [
  {
    id: "light",
    mode: "light",
    label: "theme.light",
    swatch: { ground: "#f3f3f4", card: "#ffffff", accent: "#111217" },
  },
  {
    id: "paper",
    mode: "light",
    label: "theme.paper",
    swatch: { ground: "#f3efe7", card: "#fffdf8", accent: "#2b2620" },
  },
  {
    id: "ocean",
    mode: "light",
    label: "theme.ocean",
    swatch: { ground: "#edf2f8", card: "#ffffff", accent: "#1d4ed8" },
  },
  {
    id: "lavender",
    mode: "light",
    label: "theme.lavender",
    swatch: { ground: "#f2f0f8", card: "#ffffff", accent: "#6d28d9" },
  },
  {
    id: "dark",
    mode: "dark",
    label: "theme.dark",
    swatch: { ground: "#2c2d32", card: "#3a3b42", accent: "#f2f3f6" },
  },
  {
    id: "midnight",
    mode: "dark",
    label: "theme.midnight",
    swatch: { ground: "#111a2e", card: "#1a2440", accent: "#93b6ff" },
  },
  {
    id: "black",
    mode: "dark",
    label: "theme.black",
    swatch: { ground: "#000000", card: "#161618", accent: "#f5f5f7" },
  },
  {
    id: "forest",
    mode: "dark",
    label: "theme.forest",
    swatch: { ground: "#11211a", card: "#1a2f25", accent: "#86d9a8" },
  },
];

export const THEME_IDS = THEMES.map((theme) => theme.id);

/** The ones that switch on every `dark:` style, and dark form controls. */
export const DARK_THEME_IDS = THEMES.filter((theme) => theme.mode === "dark").map(
  (theme) => theme.id,
);

/**
 * Light or dark, for the things that only know those two — the toasts, the
 * command palette's "switch to dark". An unknown name is read as light, which
 * is what the page itself falls back to.
 */
export function modeOf(themeId: string | undefined): ThemeMode {
  return THEMES.find((theme) => theme.id === themeId)?.mode ?? "light";
}
