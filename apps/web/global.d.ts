import type { Locale } from '@ayvago/shared';
import type messages from './messages/en.json';

// Gives useTranslations/getTranslations type-checked keys based on the English messages.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
