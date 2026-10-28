import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THEME, THEMES } from '@ayvago/themes';
import { describe, expect, it } from 'vitest';
import { BRAND_INK, barColor, buildManifest, manifestHref } from './manifest';

const publicDir = join(__dirname, '..', '..', 'public');

describe('web app manifest', () => {
  const m = buildManifest(null, null);

  it('meets the install criteria', () => {
    expect(m.id).toBe('/');
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    const sizes = (m.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons?.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('points at icons that exist in public/', () => {
    for (const icon of m.icons ?? []) {
      expect(existsSync(join(publicDir, icon.src)), icon.src).toBe(true);
    }
  });

  it('ships the service worker and its offline page', () => {
    expect(existsSync(join(publicDir, 'sw.js'))).toBe(true);
    expect(existsSync(join(publicDir, 'offline.html'))).toBe(true);
  });

  it("paints the system bars in the theme's bar color", () => {
    expect(m.theme_color).toBe(BRAND_INK);
    const arcade = buildManifest('arcade', 'dark');
    expect(arcade.theme_color).toBe(THEMES.arcade.colors.dark?.surface);
    expect(arcade.background_color).toBe(arcade.theme_color);
    expect(buildManifest('minimal', 'light').theme_color).toBe(
      THEMES.minimal.colors.light?.surface,
    );
    expect(buildManifest('minimal', 'dark').theme_color).toBe(THEMES.minimal.colors.dark?.surface);
  });

  it('falls back safely on unknown input', () => {
    // Dark-only themes ignore a light request; unknown themes use the default theme.
    expect(barColor('retro', 'light')).toBe(THEMES.retro.colors.dark?.surface);
    expect(barColor('nope', 'light')).toBe(THEMES[DEFAULT_THEME].colors.dark?.surface);
    expect(manifestHref('arcade', 'dark')).toBe('/manifest.webmanifest?theme=arcade&mode=dark');
  });
});
