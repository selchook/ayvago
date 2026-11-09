'use client';

import {
  TABLE_HANDS,
  TABLE_TURN_SECONDS,
  type TableSettings,
  type TableTurnSeconds,
  type TableVisibility,
} from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import styles from './table-settings.module.css';

// Table settings (docs/adr/0020-quick-play-settings-host-handover.md): chosen when a table opens,
// changed by the host while it waits, shown in the lobby and on the table page.

const TURN_KEY: Record<TableTurnSeconds, 'turnFast' | 'turnNormal' | 'turnRelaxed'> = {
  15: 'turnFast',
  30: 'turnNormal',
  60: 'turnRelaxed',
};

function Choice<T extends string | number | boolean>({
  name,
  legend,
  options,
  value,
  disabled,
  onChange,
}: {
  name: string;
  legend: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  disabled?: boolean;
  onChange(value: T): void;
}) {
  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={String(option.value)} className={styles.option}>
            <input
              type="radio"
              name={name}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The settings as radio groups; `visibility` adds the "who can sit down" choice. */
export function TableSettingsFields({
  id,
  settings,
  onChange,
  disabled,
  visibility,
  onVisibility,
}: {
  /** Unique per form on the page (radio group names). */
  id: string;
  settings: TableSettings;
  onChange(settings: TableSettings): void;
  disabled?: boolean;
  visibility?: TableVisibility;
  onVisibility?(visibility: TableVisibility): void;
}) {
  const t = useTranslations('table.settings');
  return (
    <div className={styles.fields}>
      <Choice
        name={`${id}-hands`}
        legend={t('hands')}
        value={settings.hands}
        disabled={disabled}
        options={TABLE_HANDS.map((hands) => ({
          value: hands,
          label: t('handsValue', { count: hands }),
        }))}
        onChange={(hands) => onChange({ ...settings, hands })}
      />
      <Choice
        name={`${id}-turn`}
        legend={t('turn')}
        value={settings.turnSeconds}
        disabled={disabled}
        options={TABLE_TURN_SECONDS.map((seconds) => ({
          value: seconds,
          label: t(TURN_KEY[seconds]),
        }))}
        onChange={(turnSeconds) => onChange({ ...settings, turnSeconds })}
      />
      <Choice
        name={`${id}-bots`}
        legend={t('bots')}
        value={settings.bots}
        disabled={disabled}
        options={[
          { value: true, label: t('botsOn') },
          { value: false, label: t('botsOff') },
        ]}
        onChange={(bots) => onChange({ ...settings, bots })}
      />
      {visibility && onVisibility ? (
        <Choice<TableVisibility>
          name={`${id}-visibility`}
          legend={t('visibility')}
          value={visibility}
          disabled={disabled}
          options={[
            { value: 'public', label: t('public') },
            { value: 'private', label: t('private') },
          ]}
          onChange={onVisibility}
        />
      ) : null}
    </div>
  );
}

/** The settings as short tags (lobby rows, the table page for players who are not the host). */
export function TableSettingsSummary({
  settings,
  autoStart = false,
}: {
  settings: TableSettings;
  autoStart?: boolean;
}) {
  const t = useTranslations('table.settings');
  return (
    <ul className={styles.summary} aria-label={t('title')}>
      <li>{t('handsValue', { count: settings.hands })}</li>
      <li>{t('summaryTurn', { seconds: settings.turnSeconds })}</li>
      <li>{settings.bots ? t('summaryBots') : t('summaryNoBots')}</li>
      {autoStart ? <li data-tone="accent">{t('summaryAutoStart')}</li> : null}
    </ul>
  );
}
