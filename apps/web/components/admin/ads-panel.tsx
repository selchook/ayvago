'use client';

import {
  AD_SETTING_LIMITS,
  type AdFlagSetting,
  type AdNumberSetting,
  type AdSettings,
} from '@ayvago/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account/store';
import { loadAdsAdmin, saveAdSettings, type AdsAdminState } from '@/lib/admin/ads';
import { ADSENSE_BANNER_SLOT, ADSENSE_CLIENT, PRIVACY_CONTACT } from '@/lib/ads/config';
import { adStatus } from '@/lib/ads/policy';
import { firebaseEnabled } from '@/lib/firebase/client';
import styles from './admin.module.css';

const FORMAT_FLAGS = ['rewarded', 'interstitial', 'banner'] as const;
const OTHER_FLAGS = ['testMode', 'cmpConfirmed'] as const;
const NUMBERS: AdNumberSetting[] = [
  'interstitialGapSeconds',
  'interstitialsPerSession',
  'interstitialsPerDay',
  'rewardedPerDay',
  'rewardAmount',
];

/**
 * Ads (Phase 3, docs/adr/0023-ads-behind-an-admin-switch.md): the master switch, the formats,
 * caps and test mode, what is still missing before an ad can show, and who changed it last.
 */
export function AdsPanel() {
  const t = useTranslations('admin.ads');
  const ta = useTranslations('admin');
  const format = useFormatter();
  const account = useAccount();
  const [data, setData] = useState<AdsAdminState | null>(null);
  const [form, setForm] = useState<AdSettings | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(false);
    loadAdsAdmin()
      .then((state) => {
        setData(state);
        setForm(state.settings);
      })
      .catch((e) => {
        console.warn('[admin] ads settings failed to load', e);
        setError(true);
      });
  }, []);
  useEffect(load, [load]);

  const adminName =
    account.status === 'signedIn'
      ? (account.profile?.username ?? account.email ?? account.uid)
      : '?';

  async function save(next: AdSettings, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const state = await saveAdSettings(next, adminName);
      setData(state);
      setForm((current) => (current ? { ...current, enabled: state.settings.enabled } : current));
      setMessage(done);
    } catch (e) {
      console.warn('[admin] ads settings failed to save', e);
      setMessage(ta('actionFailed'));
    } finally {
      setBusy(false);
      setConfirmOn(false);
    }
  }

  if (error) return <p className={styles.note}>{ta('loadFailed')}</p>;
  if (!data || !form) return <p role="status">{ta('loading')}</p>;

  const saved = data.settings;
  const on = saved.enabled;
  const status = adStatus({
    settings: saved,
    clientId: ADSENSE_CLIENT,
    bannerSlot: ADSENSE_BANNER_SLOT,
    firebase: firebaseEnabled(),
    privacyContact: PRIVACY_CONTACT,
  });
  const dirty =
    FORMAT_FLAGS.some((k) => form[k] !== saved[k]) ||
    OTHER_FLAGS.some((k) => form[k] !== saved[k]) ||
    NUMBERS.some((k) => form[k] !== saved[k]);
  const invalid = NUMBERS.some((k) => {
    const { min, max } = AD_SETTING_LIMITS[k];
    return !Number.isInteger(form[k]) || form[k] < min || form[k] > max;
  });
  const last = data.history[0];
  // What still stands between the switch and an ad, the switch itself aside.
  const missing = status.blockers.filter((blocker) => blocker !== 'switch-off');

  const setFlag = (key: AdFlagSetting, value: boolean) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const setNumber = (key: AdNumberSetting, value: string) =>
    setForm((current) => (current ? { ...current, [key]: Number(value) } : current));

  return (
    <section className={styles.card} aria-labelledby="ads-heading" data-testid="ads-panel">
      <h2 id="ads-heading">{t('title')}</h2>
      <p className={styles.note}>{t('intro')}</p>

      <div className={styles.master} data-on={on}>
        <div className={styles.masterText}>
          <strong data-testid="ads-state">{on ? t('stateOn') : t('stateOff')}</strong>
          <span className={styles.note}>{on ? t('stateOnHint') : t('stateOffHint')}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t('switchLabel')}
          className={styles.switch}
          disabled={busy}
          aria-busy={busy}
          data-testid="ads-switch"
          onClick={() =>
            on ? save({ ...saved, enabled: false }, t('turnedOff')) : setConfirmOn(true)
          }
        >
          <span className={styles.switchKnob} aria-hidden="true" />
          <span className={styles.switchText}>{on ? t('on') : t('off')}</span>
        </button>
      </div>

      <div className={styles.status} data-testid="ads-status" data-live={on && status.live}>
        {on && status.live ? (
          <p>
            <strong>{t('status.live')}</strong>
          </p>
        ) : (
          <>
            <p>
              <strong>{on ? t('status.onButBlocked') : t('status.offTitle')}</strong>
            </p>
            {missing.length > 0 ? (
              <>
                {on ? null : <p>{t('status.missing')}</p>}
                <ul className={styles.statusList}>
                  {missing.map((blocker) => (
                    <li key={blocker} data-kind="blocker">
                      {t(`status.blockers.${blocker}`)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
        <p className={styles.config} data-testid="ads-config">
          {t.rich('status.config', {
            client: ADSENSE_CLIENT || t('status.notSet'),
            slot: ADSENSE_BANNER_SLOT || t('status.notSet'),
            code: (chunks) => <code>{chunks}</code>,
          })}
        </p>
        {saved.banner ? (
          <p className={styles.config} data-testid="ads-banner-where">
            {t('status.bannerWhere')}
          </p>
        ) : null}
        {status.warnings.length > 0 ? (
          <ul className={styles.statusList}>
            {status.warnings.map((warning) => (
              <li key={warning} data-kind="warning">
                {t(`status.warnings.${warning}`)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {message ? (
        <p role="status" className={styles.message}>
          {message}
        </p>
      ) : null}

      <form
        className={styles.adsForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (!invalid) void save({ ...form, enabled: saved.enabled }, t('saved'));
        }}
      >
        <fieldset className={styles.fieldset}>
          <legend>{t('formats.title')}</legend>
          {FORMAT_FLAGS.map((key) => (
            <label key={key} className={styles.check}>
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(event) => setFlag(key, event.target.checked)}
              />
              <span>
                {t(`formats.${key}`)}
                <span className={styles.note}> · {t(`formats.${key}Hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>{t('caps.title')}</legend>
          <div className={styles.numberGrid}>
            {NUMBERS.map((key) => (
              <label key={key} className={styles.field}>
                {t(`caps.${key}`)}
                <input
                  type="number"
                  inputMode="numeric"
                  min={AD_SETTING_LIMITS[key].min}
                  max={AD_SETTING_LIMITS[key].max}
                  step={1}
                  value={Number.isFinite(form[key]) ? form[key] : ''}
                  onChange={(event) => setNumber(key, event.target.value)}
                />
                <span className={styles.note}>{t('caps.range', AD_SETTING_LIMITS[key])}</span>
              </label>
            ))}
          </div>
          <p className={styles.note}>{t('caps.rewardAmountHint')}</p>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>{t('setup.title')}</legend>
          {OTHER_FLAGS.map((key) => (
            <label key={key} className={styles.check}>
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(event) => setFlag(key, event.target.checked)}
              />
              <span>
                {t(`setup.${key}`)}
                <span className={styles.note}> · {t(`setup.${key}Hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.button}
            disabled={busy || !dirty || invalid}
            aria-busy={busy}
            data-testid="ads-save"
          >
            {busy ? t('saving') : t('save')}
          </button>
          {!dirty && !busy ? <span className={styles.note}>{t('noChanges')}</span> : null}
          {dirty ? (
            <button
              type="button"
              className={styles.plain}
              disabled={busy}
              onClick={() => setForm({ ...saved })}
            >
              {t('discard')}
            </button>
          ) : null}
          {invalid ? <span className={styles.note}>{t('invalid')}</span> : null}
        </div>
      </form>

      <div className={styles.audit} data-testid="ads-audit">
        <h3>{t('audit.title')}</h3>
        {last ? (
          <>
            <p>
              {t('audit.last', {
                name: last.name,
                time: format.dateTime(last.at, { dateStyle: 'medium', timeStyle: 'short' }),
              })}
            </p>
            <ul className={styles.auditList}>
              {data.history.map((entry) => (
                <li key={entry.id}>
                  {format.dateTime(entry.at, { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                  {entry.name} · {entry.enabled ? t('on') : t('off')}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.note}>{data.exists ? t('audit.unknown') : t('audit.never')}</p>
        )}
      </div>

      <ConfirmOnDialog
        open={confirmOn}
        busy={busy}
        blocked={missing.length}
        onConfirm={() => save({ ...saved, enabled: true }, t('turnedOn'))}
        onCancel={() => setConfirmOn(false)}
      />
    </section>
  );
}

/** "Turn ads on?" A native modal dialog; Escape or the backdrop cancel. Focus starts on Cancel. */
function ConfirmOnDialog({
  open,
  busy,
  blocked,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  /** How many setup steps are still missing (ads stay invisible until they are done). */
  blocked: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('admin.ads.confirm');
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="ads-confirm-title"
      aria-describedby="ads-confirm-body"
      data-testid="ads-confirm"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className={styles.dialogBody}>
        <h2 id="ads-confirm-title">{t('title')}</h2>
        <p id="ads-confirm-body">{t('body')}</p>
        {blocked > 0 ? <p className={styles.warn}>{t('blocked', { count: blocked })}</p> : null}
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.plain}
            disabled={busy}
            onClick={onCancel}
          >
            {t('cancel')}
          </button>
          <button type="button" className={styles.button} disabled={busy} onClick={onConfirm}>
            {t('confirm')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
