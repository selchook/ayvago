'use client';

import { THEMES, THEME_IDS, colorsFor, type ModePreference, type ThemeId } from '@ayvago/themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { applyTheme, readThemeState, type ThemeState } from '@/lib/theme-client';
import { PaletteIcon } from './icons';
import styles from './popover.module.css';

const MODES: ModePreference[] = ['system', 'light', 'dark'];

export function ThemeSwitcher() {
  const t = useTranslations('theme');
  // Matches the server render; the real value is read from <html> after mount.
  const [state, setState] = useState<ThemeState>({
    theme: 'minimal',
    preference: 'system',
    mode: 'light',
  });

  useEffect(() => {
    setState(readThemeState());
  }, []);

  const singleMode = THEMES[state.theme].modes.length === 1;

  function choose(theme: ThemeId, preference: ModePreference) {
    setState(applyTheme(theme, preference));
  }

  return (
    <details className={styles.popover}>
      <summary className={styles.trigger} aria-label={t('label')}>
        <PaletteIcon />
      </summary>
      <div className={styles.panel}>
        <fieldset className={styles.group}>
          <legend>{t('themes')}</legend>
          <div className={styles.themeOptions}>
            {THEME_IDS.map((id) => {
              const swatch = colorsFor(id, THEMES[id].modes[0] ?? 'light');
              return (
                <label key={id} className={styles.themeOption} data-option={id}>
                  <input
                    type="radio"
                    name="ayvago-theme"
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
                  name="ayvago-mode"
                  value={mode}
                  checked={state.preference === mode}
                  onChange={() => choose(state.theme, mode)}
                />
                <span>{t(mode)}</span>
              </label>
            ))}
          </div>
          {singleMode ? <p className={styles.hint}>{t('retroDarkOnly')}</p> : null}
        </fieldset>
      </div>
    </details>
  );
}
