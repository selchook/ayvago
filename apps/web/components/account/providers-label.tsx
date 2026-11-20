'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { SignInProvider } from '@/lib/account/store';

/** "Google", "Google and Facebook" ("Google ve Facebook"): the connected sign-in methods. */
export function useProvidersLabel() {
  const t = useTranslations('account');
  const locale = useLocale();
  return (providers: readonly SignInProvider[]) =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(
      providers.map((provider) => t(`providers.${provider}`)),
    );
}
