'use client';

import { useLayoutEffect } from 'react';
import { restoreThemeFromCookies, syncThemeColor } from '@/lib/theme-client';

// Runs whenever the [locale] layout mounts (first load and every language switch), before paint.
// Also keeps the browser bar color in step when "system" mode follows a light/dark switch.
export function ThemeRestorer() {
  useLayoutEffect(() => {
    restoreThemeFromCookies();
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', syncThemeColor);
    return () => media?.removeEventListener('change', syncThemeColor);
  }, []);
  return null;
}
