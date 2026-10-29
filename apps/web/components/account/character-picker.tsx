'use client';

import { CHARACTER_IDS, characterPreviewPath, type CharacterId } from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { updateProfile } from '@/lib/account/store';
import menuStyles from './account.module.css';
import profileStyles from './profile.module.css';
import styles from './character-picker.module.css';

type SaveState = 'idle' | 'saved' | 'error';

/**
 * The player's character for games with a hero (docs/adr/0013-player-characters.md). A native
 * radio group: Tab reaches the group, the arrow keys move the choice, and each choice is saved
 * to the profile at once.
 */
export function CharacterPicker({ current }: { current: CharacterId | null }) {
  const t = useTranslations('profile');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  function choose(id: CharacterId) {
    setSaveState('idle');
    updateProfile({ characterId: id }).then(
      () => setSaveState('saved'),
      (cause) => {
        console.error('[profile] saving character failed', cause);
        setSaveState('error');
      },
    );
  }

  return (
    <div className={profileStyles.setting} data-testid="character-picker">
      <h3 id="character-heading">{t('character')}</h3>
      <p id="character-help" className={profileStyles.muted}>
        {t('characterHelp')}
      </p>
      <fieldset className={styles.grid} aria-describedby="character-help">
        <legend className="visually-hidden">{t('character')}</legend>
        {CHARACTER_IDS.map((id) => (
          <label key={id} className={styles.option} data-character={id}>
            <input
              type="radio"
              name="character"
              value={id}
              checked={current === id}
              onChange={() => choose(id)}
            />
            <span className={styles.art}>
              <img
                src={characterPreviewPath(id)}
                alt=""
                width={144}
                height={176}
                loading="lazy"
                decoding="async"
              />
            </span>
            <span className={styles.name}>{t(`characters.${id}`)}</span>
          </label>
        ))}
      </fieldset>
      <p className={styles.status} role="status">
        {saveState === 'saved' && current
          ? t('characterSaved', { name: t(`characters.${current}`) })
          : current
            ? null
            : t('characterNone')}
      </p>
      {saveState === 'error' ? (
        <p className={menuStyles.error} role="alert">
          {t('saveFailed')}
        </p>
      ) : null}
    </div>
  );
}
