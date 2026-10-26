'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { Locale } from '@ayvago/shared';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  reconcilePreferences,
  signInWithGoogle,
  signOut,
  useAccount,
  type SignInError,
} from '@/lib/account/store';
import { GoogleLogo, UserIcon } from '../icons';
import popover from '../popover.module.css';
import { Avatar } from './avatar';
import styles from './account.module.css';

export function AccountMenu() {
  const t = useTranslations('account');
  const locale = useLocale() as Locale;
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Lives in the top bar, so it runs on every page: applies or saves account preferences.
  const signedInUid = account.status === 'signedIn' ? account.uid : null;
  const profileLoaded = account.status === 'signedIn' && account.profile !== null;
  useEffect(() => {
    if (!signedInUid || !profileLoaded) return;
    reconcilePreferences(locale, (next) => router.replace(pathname, { locale: next }));
  }, [signedInUid, profileLoaded, locale, pathname, router]);

  if (account.status === 'disabled') return null;
  // Same footprint as the real trigger, so the top bar does not shift once auth has loaded.
  if (account.status === 'loading') {
    return <span className={`${popover.trigger} ${styles.placeholder}`} aria-hidden="true" />;
  }

  async function google() {
    setBusy(true);
    setError(null);
    setError(await signInWithGoogle(locale));
    setBusy(false);
  }

  const googleButton = (label: string) => (
    <button type="button" className={styles.googleButton} onClick={google} disabled={busy}>
      <GoogleLogo />
      {busy ? t('working') : label}
    </button>
  );

  const errorMessage = error ? (
    <p className={styles.error} role="alert">
      {t(`errors.${error.kind}`)}
      {error.code ? (
        <span className={styles.errorCode}>{t('errors.code', { code: error.code })}</span>
      ) : null}
    </p>
  ) : null;

  if (account.status === 'signedOut') {
    return (
      // Keyed by state so the menu closes when the player signs out.
      <details key="signedOut" className={popover.popover}>
        <summary className={popover.trigger} aria-label={t('menuLabel')}>
          <UserIcon />
          <span className={`${popover.triggerText} ${styles.wideOnly}`}>{t('signIn')}</span>
        </summary>
        <div className={`${popover.panel} ${styles.panel}`}>
          <strong className={styles.title}>{t('signedOutTitle')}</strong>
          <p className={styles.body}>{t('signedOutBody')}</p>
          {googleButton(t('continueWithGoogle'))}
          {errorMessage}
          <p className={popover.hint}>{t('guestHint')}</p>
        </div>
      </details>
    );
  }

  const name = account.profile?.username ?? null;
  const avatarId = account.profile?.avatarId ?? null;
  return (
    // Stays open across a guest upgrade so the player sees the result.
    <details key="signedIn" className={popover.popover}>
      <summary
        className={popover.trigger}
        aria-label={t('menuLabel')}
        data-account={account.isGuest ? 'guest' : 'registered'}
      >
        <Avatar uid={account.uid} name={name} avatarId={avatarId} size={26} />
        <span className={`${popover.triggerText} ${styles.wideOnly} ${styles.name}`}>{name}</span>
      </summary>
      <div className={`${popover.panel} ${styles.panel}`}>
        <div className={styles.identity}>
          <Avatar uid={account.uid} name={name} avatarId={avatarId} size={44} />
          <div>
            <strong className={styles.title} data-testid="account-name">
              {name}
            </strong>
            {account.isGuest ? (
              <span className={styles.badge}>{t('guestBadge')}</span>
            ) : (
              <span className={styles.provider}>{t('signedInWithGoogle')}</span>
            )}
          </div>
        </div>
        <Link
          href="/profile"
          className={styles.secondaryButton}
          onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
        >
          {t('profileLink')}
        </Link>
        {account.isAdmin ? (
          <Link
            href="/admin"
            className={styles.secondaryButton}
            onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
          >
            {t('adminLink')}
          </Link>
        ) : null}
        {account.isGuest ? (
          <>
            <p className={styles.body}>{t('guestBody')}</p>
            {googleButton(t('saveWithGoogle'))}
            {errorMessage}
          </>
        ) : (
          <button type="button" className={styles.secondaryButton} onClick={() => signOut()}>
            {t('signOut')}
          </button>
        )}
      </div>
    </details>
  );
}
