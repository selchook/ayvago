'use client';

import { useLayoutEffect } from 'react';
import { restoreThemeFromCookies } from '@/lib/theme-client';

// Runs whenever the [locale] layout mounts (first load and every language switch), before paint.
export function ThemeRestorer() {
  useLayoutEffect(() => {
    restoreThemeFromCookies();
  }, []);
  return null;
}
