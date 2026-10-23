'use client';

import {
  DEFAULT_THEME,
  MODE_COOKIE,
  PREFERENCE_COOKIE_MAX_AGE,
  THEME_COOKIE,
  isModePreference,
  isThemeId,
  resolveMode,
  type ColorMode,
  type ModePreference,
  type ThemeId,
} from '@ayvago/themes';

// Client-side theme state. The <html> attributes are the source of truth (set before first
// paint by the bootstrap script); this module reads and updates them and the cookies.

export const THEME_CHANGE_EVENT = 'ayvago:themechange';

export type ThemeState = { theme: ThemeId; preference: ModePreference; mode: ColorMode };

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function readThemeState(): ThemeState {
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme');
  const mode = root.getAttribute('data-mode');
  const resolvedTheme = isThemeId(theme) ? theme : DEFAULT_THEME;
  const preference: ModePreference = isModePreference(mode) ? mode : 'system';
  return {
    theme: resolvedTheme,
    preference,
    mode: resolveMode(resolvedTheme, preference, systemPrefersDark()),
  };
}

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${PREFERENCE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function applyTheme(theme: ThemeId, preference: ModePreference): ThemeState {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (preference === 'system') root.removeAttribute('data-mode');
  else root.setAttribute('data-mode', preference);

  setCookie(THEME_COOKIE, theme);
  setCookie(MODE_COOKIE, preference);

  const state = readThemeState();
  window.dispatchEvent(new CustomEvent<ThemeState>(THEME_CHANGE_EVENT, { detail: state }));
  return state;
}
