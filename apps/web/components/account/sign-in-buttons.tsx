'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Locale } from '@ayvago/shared';
import {
  continueSignIn,
  SIGN_IN_OPTIONS,
  signInWith,
  type PendingLink,
  type SignInError,
  type SignInProvider,
} from '@/lib/account/store';
import { FacebookLogo, GoogleLogo } from '../icons';
import styles from './account.module.css';

type SignInFailureState = Exclude<SignInError, { kind: 'existingAccount' }>;

const BUTTON_CLASS: Record<SignInProvider, string> = {
  google: styles.googleButton!,
  facebook: styles.facebookButton!,
};

const LOGO: Record<SignInProvider, () => React.ReactNode> = {
  google: () => <GoogleLogo />,
  facebook: () => <FacebookLogo />,
};

/**
 * The sign-in buttons of every entry point (account menu, profile page): one per enabled
 * provider, the error of the last attempt, and the next step when the email already belongs to
 * an account of the other provider (docs/adr/0028-social-sign-in-providers.md).
 */
export function SignInButtons({ purpose }: { purpose: 'continue' | 'save' }) {
  const t = useTranslations('account');
  const locale = useLocale() as Locale;
  const [busy, setBusy] = useState<SignInProvider | null>(null);
  const [error, setError] = useState<SignInFailureState | null>(null);
  // Kept until the player cancels it or another sign-in starts, so a closed popup can be retried.
  const [pending, setPending] = useState<PendingLink | null>(null);
  const providerName = (provider: SignInProvider) => t(`providers.${provider}`);

  async function run(provider: SignInProvider, action: () => Promise<SignInError | null>) {
    setBusy(provider);
    setError(null);
    const result = await action();
    if (result?.kind === 'existingAccount') setPending(result.pending);
    else if (result) setError(result);
    setBusy(null);
  }

  const errorMessage = error ? (
    <p className={styles.error} role="alert">
      {t(`errors.${error.kind}`)}
      {error.code ? (
        <span className={styles.errorCode}>{t('errors.code', { code: error.code })}</span>
      ) : null}
    </p>
  ) : null;

  const button = (provider: SignInProvider, label: string, onClick: () => void) => (
    <button
      key={provider}
      type="button"
      className={BUTTON_CLASS[provider]}
      onClick={onClick}
      disabled={busy !== null}
      data-provider={provider}
    >
      {LOGO[provider]()}
      {busy === provider ? t('working') : label}
    </button>
  );

  if (pending) {
    return (
      <div className={styles.notice} role="status" data-testid="sign-in-existing-account">
        <p>
          {t('existingAccount.body', {
            existing: providerName(pending.existing),
            attempted: providerName(pending.attempted),
          })}
        </p>
        {button(
          pending.existing,
          t('continueWith', { provider: providerName(pending.existing) }),
          () => run(pending.existing, () => continueSignIn(pending, locale)),
        )}
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => {
            setPending(null);
            setError(null);
          }}
          disabled={busy !== null}
        >
          {t('existingAccount.cancel')}
        </button>
        {errorMessage}
      </div>
    );
  }

  return (
    <div className={styles.signInButtons}>
      {SIGN_IN_OPTIONS.map((provider) =>
        button(
          provider,
          t(purpose === 'save' ? 'saveWith' : 'continueWith', { provider: providerName(provider) }),
          () => run(provider, () => signInWith(provider, locale)),
        ),
      )}
      {errorMessage}
    </div>
  );
}
