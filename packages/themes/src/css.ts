import {
  DEFAULT_THEME,
  THEMES,
  THEME_IDS,
  colorsFor,
  type ColorMode,
  type ColorTokens,
  type ThemeDefinition,
  type ThemeId,
} from './tokens';

// Converts camelCase token keys to CSS custom property names ("textMuted" -> "--text-muted").
export function cssVarName(key: string): string {
  return `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function declarations(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${cssVarName(key)}:${value};`)
    .join('');
}

function colorBlock(colors: ColorTokens, mode: ColorMode): string {
  return `${declarations(colors)}color-scheme:${mode};`;
}

function staticBlock(def: ThemeDefinition): string {
  return declarations({ ...def.shape, ...def.type, ...def.motion });
}

// Aliases for the GameHub Arena CSS variables that existing games already read.
const LEGACY_ALIASES =
  '--bg-card:var(--surface);--bg-surface:var(--surface);--bg-elevated:var(--surface-raised);' +
  '--text-dim:var(--text-muted);--radius:var(--radius-md);' +
  '--accent-dim:color-mix(in srgb,var(--accent) 15%,transparent);';

/**
 * Builds the CSS for every theme and mode.
 *
 * <html data-theme="minimal">                    light, or dark when the OS prefers dark
 * <html data-theme="minimal" data-mode="dark">   explicit dark
 * <html data-theme="retro">                       retro has a single (dark) mode
 */
export function buildThemeCss(): string {
  const rules: string[] = [`:root{${LEGACY_ALIASES}}`];

  // The default theme comes first: its block also targets :root, and a :root rule placed after
  // another theme's [data-theme] rule (same specificity) would override that theme.
  const order = [DEFAULT_THEME, ...THEME_IDS.filter((id) => id !== DEFAULT_THEME)];
  for (const id of order) {
    const def = THEMES[id];
    const sel = `[data-theme="${id}"]`;
    const first = def.modes[0] as ColorMode;
    const base = id === DEFAULT_THEME ? `:root,${sel}` : sel;

    rules.push(`${base}{${staticBlock(def)}${colorBlock(colorsFor(id, first), first)}}`);

    if (def.modes.includes('dark') && first !== 'dark') {
      const dark = colorBlock(colorsFor(id, 'dark'), 'dark');
      rules.push(`${sel}[data-mode="dark"]{${dark}}`);
      rules.push(`@media (prefers-color-scheme:dark){${sel}:not([data-mode="light"]){${dark}}}`);
    }
  }
  return rules.join('\n');
}

/**
 * Flat token map sent to games in GHA_START.config.tokens, using both the semantic names and
 * the legacy GameHub Arena names so older games pick them up without changes.
 */
export function gameTokens(theme: ThemeId, mode: ColorMode): Record<string, string> {
  const def = THEMES[theme];
  const c = colorsFor(theme, mode);
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...c, ...def.shape, ...def.type })) {
    tokens[cssVarName(key)] = value;
  }
  Object.assign(tokens, {
    '--bg-card': c.surface,
    '--bg-surface': c.surface,
    '--bg-elevated': c.surfaceRaised,
    '--text-dim': c.textMuted,
    '--radius': def.shape.radiusMd,
  });
  return tokens;
}
