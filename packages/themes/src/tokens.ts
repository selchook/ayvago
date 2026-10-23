// Theme definitions: one set of semantic tokens per theme and color mode.
// Components only ever read these semantic tokens (as CSS custom properties).

export const THEME_IDS = ['minimal', 'retro', 'cartoon'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const COLOR_MODES = ['light', 'dark'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

// "system" follows prefers-color-scheme; it is a preference, not a rendered mode.
export type ModePreference = ColorMode | 'system';

export const DEFAULT_THEME: ThemeId = 'minimal';

export type ColorTokens = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  accent: string;
  // Text/icon color used on top of the accent color.
  accentContrast: string;
  // Decorative second accent (badges, highlights); never used for body text.
  accent2: string;
  success: string;
  warning: string;
  danger: string;
  border: string;
  focusRing: string;
};

export type ShapeTokens = {
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  borderWidth: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
};

export type TypeTokens = {
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  // Multiplier for body text; pixel fonts need larger sizes to stay readable.
  fontBodyScale: string;
  // Display text is uppercase in the retro theme.
  displayTransform: string;
};

export type MotionTokens = {
  motionFast: string;
  motionBase: string;
  motionSlow: string;
  easing: string;
};

export type ThemeDefinition = {
  id: ThemeId;
  modes: readonly ColorMode[];
  colors: Partial<Record<ColorMode, ColorTokens>>;
  shape: ShapeTokens;
  type: TypeTokens;
  motion: MotionTokens;
};

const SYSTEM_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const SYSTEM_MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  minimal: {
    id: 'minimal',
    modes: ['light', 'dark'],
    colors: {
      light: {
        bg: '#f5f6fa',
        surface: '#ffffff',
        surfaceRaised: '#ffffff',
        text: '#161a2e',
        textMuted: '#525870',
        accent: '#3a4ddc',
        accentContrast: '#ffffff',
        accent2: '#0f9f8f',
        success: '#13703a',
        warning: '#835400',
        danger: '#b42318',
        border: '#dce0eb',
        focusRing: '#3a4ddc',
      },
      dark: {
        bg: '#0e1018',
        surface: '#161926',
        surfaceRaised: '#1e2232',
        text: '#e8eaf3',
        textMuted: '#a2a8bf',
        accent: '#8e9cff',
        accentContrast: '#0e1018',
        accent2: '#4fd1c1',
        success: '#4ade80',
        warning: '#fbbf24',
        danger: '#ff8a80',
        border: '#2a2f45',
        focusRing: '#8e9cff',
      },
    },
    shape: {
      radiusSm: '6px',
      radiusMd: '10px',
      radiusLg: '16px',
      borderWidth: '1px',
      shadowSm: '0 1px 2px rgb(15 20 40 / 0.08)',
      shadowMd: '0 4px 14px rgb(15 20 40 / 0.10)',
      shadowLg: '0 12px 32px rgb(15 20 40 / 0.16)',
    },
    type: {
      fontDisplay: `'Inter Variable', ${SYSTEM_SANS}`,
      fontBody: `'Inter Variable', ${SYSTEM_SANS}`,
      fontMono: SYSTEM_MONO,
      fontBodyScale: '1',
      displayTransform: 'none',
    },
    motion: {
      motionFast: '120ms',
      motionBase: '200ms',
      motionSlow: '320ms',
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  },

  retro: {
    id: 'retro',
    modes: ['dark'],
    colors: {
      dark: {
        bg: '#07090c',
        surface: '#0f141a',
        surfaceRaised: '#161d25',
        text: '#d9ffe6',
        textMuted: '#86c49c',
        accent: '#39ff88',
        accentContrast: '#03140a',
        accent2: '#ff3df0',
        success: '#39ff88',
        warning: '#ffd23f',
        danger: '#ff5c7a',
        border: '#2e4a3a',
        focusRing: '#ff3df0',
      },
    },
    shape: {
      radiusSm: '0',
      radiusMd: '0',
      radiusLg: '0',
      borderWidth: '2px',
      shadowSm: '2px 2px 0 #000',
      shadowMd: '4px 4px 0 #000',
      shadowLg: '6px 6px 0 #000',
    },
    type: {
      fontDisplay: `'Press Start 2P', ${SYSTEM_MONO}`,
      fontBody: `'VT323', ${SYSTEM_MONO}`,
      fontMono: `'VT323', ${SYSTEM_MONO}`,
      fontBodyScale: '1.3',
      displayTransform: 'uppercase',
    },
    motion: {
      motionFast: '80ms',
      motionBase: '160ms',
      motionSlow: '240ms',
      easing: 'steps(3, end)',
    },
  },

  cartoon: {
    id: 'cartoon',
    modes: ['light', 'dark'],
    colors: {
      light: {
        bg: '#fff1c2',
        surface: '#ffffff',
        surfaceRaised: '#fffaf0',
        text: '#1f1a3d',
        textMuted: '#584d7c',
        accent: '#d61f6f',
        accentContrast: '#ffffff',
        accent2: '#2f7bff',
        success: '#0f7a55',
        warning: '#8a5300',
        danger: '#c4122f',
        border: '#1f1a3d',
        focusRing: '#2f7bff',
      },
      dark: {
        bg: '#1b1638',
        surface: '#261f4d',
        surfaceRaised: '#30285e',
        text: '#fff7e0',
        textMuted: '#cbc1e8',
        accent: '#ffd23f',
        accentContrast: '#1b1638',
        accent2: '#ff7ab6',
        success: '#5ee6a8',
        warning: '#ffd23f',
        danger: '#ff8fa3',
        border: '#0b0820',
        focusRing: '#7fb0ff',
      },
    },
    shape: {
      radiusSm: '12px',
      radiusMd: '20px',
      radiusLg: '28px',
      borderWidth: '3px',
      shadowSm: '0 2px 0 var(--border)',
      shadowMd: '0 4px 0 var(--border)',
      shadowLg: '0 8px 0 var(--border)',
    },
    type: {
      fontDisplay: `'Fredoka Variable', ${SYSTEM_SANS}`,
      fontBody: `'Baloo 2 Variable', ${SYSTEM_SANS}`,
      fontMono: SYSTEM_MONO,
      fontBodyScale: '1.05',
      displayTransform: 'none',
    },
    motion: {
      motionFast: '120ms',
      motionBase: '220ms',
      motionSlow: '380ms',
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  },
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export function isModePreference(value: unknown): value is ModePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

// The mode a theme actually renders in: themes with a single mode ignore the preference.
export function resolveMode(
  theme: ThemeId,
  preference: ModePreference,
  systemDark: boolean,
): ColorMode {
  const { modes } = THEMES[theme];
  const wanted: ColorMode = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  return modes.includes(wanted) ? wanted : (modes[0] as ColorMode);
}

export function colorsFor(theme: ThemeId, mode: ColorMode): ColorTokens {
  const def = THEMES[theme];
  const colors = def.colors[mode] ?? def.colors[def.modes[0] as ColorMode];
  if (!colors) throw new Error(`Theme ${theme} defines no colors`);
  return colors;
}
