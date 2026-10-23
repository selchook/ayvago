import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { buildThemeCss, cssVarName, gameTokens } from './css';
import { themeBootstrapScript } from './preference';
import {
  COLOR_MODES,
  THEMES,
  THEME_IDS,
  colorsFor,
  resolveMode,
  type ColorMode,
  type ColorTokens,
} from './tokens';

const combos = THEME_IDS.flatMap((id) =>
  COLOR_MODES.filter((mode) => THEMES[id].modes.includes(mode)).map((mode) => [id, mode] as const),
);

// [foreground, background, minimum ratio] — WCAG AA: 4.5 for text, 3 for large text and UI.
const PAIRS: [keyof ColorTokens, keyof ColorTokens, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surfaceRaised', 4.5],
  ['textMuted', 'bg', 4.5],
  ['textMuted', 'surface', 4.5],
  ['accentContrast', 'accent', 4.5],
  ['accent', 'bg', 3],
  ['accent', 'surface', 3],
  ['success', 'surface', 3],
  ['warning', 'surface', 3],
  ['danger', 'surface', 3],
  ['focusRing', 'bg', 3],
];

describe('theme contrast (WCAG AA)', () => {
  it('covers five theme/mode combinations', () => {
    expect(combos).toHaveLength(5);
  });

  it.each(combos)('%s / %s meets every contrast pair', (theme, mode) => {
    const c = colorsFor(theme, mode as ColorMode);
    const failures = PAIRS.filter(([fg, bg, min]) => contrastRatio(c[fg], c[bg]) < min).map(
      ([fg, bg, min]) => `${fg} on ${bg}: ${contrastRatio(c[fg], c[bg]).toFixed(2)} < ${min}`,
    );
    expect(failures).toEqual([]);
  });
});

describe('resolveMode', () => {
  it('follows the system preference for two-mode themes', () => {
    expect(resolveMode('minimal', 'system', true)).toBe('dark');
    expect(resolveMode('minimal', 'system', false)).toBe('light');
  });

  it('forces the only available mode for single-mode themes', () => {
    expect(resolveMode('retro', 'light', false)).toBe('dark');
  });
});

describe('buildThemeCss', () => {
  const css = buildThemeCss();

  it('defines every semantic token for every theme', () => {
    for (const id of THEME_IDS) {
      expect(css).toContain(`[data-theme="${id}"]`);
    }
    for (const key of Object.keys(colorsFor('minimal', 'light'))) {
      expect(css).toContain(`${cssVarName(key)}:`);
    }
  });

  it('keeps the legacy GameHub Arena variable names', () => {
    expect(css).toContain('--bg-card:var(--surface)');
    expect(css).toContain('--text-dim:var(--text-muted)');
  });
});

describe('gameTokens', () => {
  it('resolves legacy names to concrete values', () => {
    const tokens = gameTokens('cartoon', 'light');
    expect(tokens['--bg-card']).toBe(colorsFor('cartoon', 'light').surface);
    expect(tokens['--accent']).toBe(colorsFor('cartoon', 'light').accent);
  });
});

describe('themeBootstrapScript', () => {
  it('is small enough to inline in <head>', () => {
    expect(themeBootstrapScript.length).toBeLessThan(600);
  });
});
