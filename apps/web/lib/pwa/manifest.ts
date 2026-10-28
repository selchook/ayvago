import { DEFAULT_THEME, THEMES, isThemeId, resolveMode, type ThemeId } from '@ayvago/themes';
import type { MetadataRoute } from 'next';

// Web app manifest: lets players install Ayvago from the browser (Android, desktop Chromium;
// iOS through Share → Add to Home Screen). Icons are the Ayvago mark on brand ink.
//
// The installed app's system bars (Android status and navigation bars, the splash screen) take
// their colors from the manifest, not from the page. So the manifest is generated per theme and
// mode (/manifest.webmanifest?theme=arcade&mode=dark), in the color of the app's own top and
// bottom bars; the page points its manifest link at the player's current theme
// (syncThemeColor in lib/theme-client.ts).

export const BRAND_INK = '#201e1d';

/**
 * Inline <head> script, after the theme bootstrap: adds theme-color and the manifest link for the
 * saved theme before first paint. The script creates both tags itself. Next metadata rewrites
 * its tags on every client navigation (back to the defaults), and React re-adds head tags it
 * rendered whose attributes changed. syncThemeColor (lib/theme-client.ts) updates them later.
 */
export const BAR_COLOR_SCRIPT = `(function(){var h=document.head,m=document.createElement('meta'),l=document.createElement('link');m.name='theme-color';m.content='${BRAND_INK}';l.rel='manifest';l.href='/manifest.webmanifest';try{var d=document.documentElement,c=getComputedStyle(d).getPropertyValue('--surface').trim(),t=d.getAttribute('data-theme')||'minimal',o=d.getAttribute('data-mode')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(c)m.content=c;l.href='/manifest.webmanifest?theme='+t+'&mode='+o;}catch(e){}h.appendChild(m);h.appendChild(l);})();`;

export function manifestHref(theme: ThemeId, mode: 'light' | 'dark'): string {
  return `/manifest.webmanifest?theme=${theme}&mode=${mode}`;
}

/** The color of the app's top and bottom bars in a theme and mode. */
export function barColor(theme: string | null, mode: string | null): string {
  const id: ThemeId = isThemeId(theme) ? theme : DEFAULT_THEME;
  const resolved = resolveMode(id, mode === 'dark' ? 'dark' : 'light', false);
  return THEMES[id].colors[resolved]?.surface ?? BRAND_INK;
}

export function buildManifest(theme: string | null, mode: string | null): MetadataRoute.Manifest {
  // Without a theme (the first request, before the page has run) the brand ink is used.
  const color = theme ? barColor(theme, mode) : BRAND_INK;
  return {
    id: '/',
    name: 'Ayvago Games',
    short_name: 'Ayvago',
    description: 'Retro arcade, action, casual and puzzle games, free in your browser.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: color,
    theme_color: color,
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
