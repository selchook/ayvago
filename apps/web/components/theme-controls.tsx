'use client';

import {
  DEFAULT_THEME,
  THEMES,
  THEME_IDS,
  colorsFor,
  type ModePreference,
  type ThemeId,
} from '@ayvago/themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  applyTheme,
  readThemeState,
  THEME_CHANGE_EVENT,
  type ThemeState,
} from '@/lib/theme-client';
import styles from './popover.module.css';

const MODES: ModePreference[] = ['system', 'light', 'dark'];

// Theme and mode pickers, used by the top bar switcher and the settings page. `name` keeps the
// radio groups of two instances on one page apart.
export function ThemeControls({ name }: { name: string }) {
  const t = useTranslations('theme');
  // Matches the server render; the real value is read from <html> after mount.
  const [state, setState] = useState<ThemeState>({
    theme: DEFAULT_THEME,
    preference: 'system',
    mode: THEMES[DEFAULT_THEME].modes[0] ?? 'dark',
  });

  useEffect(() => {
    setState(readThemeState());
    // Stay in sync when another control (or a saved account preference) changes the theme.
    const onChange = () => setState(readThemeState());
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  }, []);

  const singleMode = THEMES[state.theme].modes.length === 1;

  function choose(theme: ThemeId, preference: ModePreference) {
    setState(applyTheme(theme, preference));
  }

  return (
    <>
      <fieldset className={styles.group}>
        <legend>{t('themes')}</legend>
        <div className={styles.themeOptions}>
          {THEME_IDS.map((id) => {
            const swatch = colorsFor(id, THEMES[id].modes[0] ?? 'light');
            return (
              <label key={id} className={styles.themeOption} data-option={id}>
                <input
                  type="radio"
                  name={`${name}-theme`}
                  value={id}
                  checked={state.theme === id}
                  onChange={() => choose(id, state.preference)}
                />
                <span
                  className={styles.swatch}
                  style={{ background: swatch.bg, borderColor: swatch.accent }}
                  aria-hidden="true"
                >
                  <span style={{ background: swatch.accent }} />
                  <span style={{ background: swatch.accent2 }} />
                </span>
                <span>{t(id)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className={styles.group} disabled={singleMode}>
        <legend>{t('mode')}</legend>
        <div className={styles.segmented}>
          {MODES.map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name={`${name}-mode`}
                value={mode}
                checked={state.preference === mode}
                onChange={() => choose(state.theme, mode)}
              />
              <span>{t(mode)}</span>
            </label>
          ))}
        </div>
        {singleMode ? <p className={styles.hint}>{t('darkOnly')}</p> : null}
      </fieldset>
    </>
  );
}
