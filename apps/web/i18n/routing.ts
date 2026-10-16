import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@ayvago/shared';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Every page lives under /en or /tr so each language has its own indexable URL.
  localePrefix: 'always',
});
