import type { Locale } from './locales';

// Player profile rules shared by the web app and the Firestore rules tests.
// firebase/firestore.rules repeats USERNAME_PATTERN; keep the two in sync.

/** 3–20 characters: letters (including Turkish), digits and "_"; starts with a letter. */
export const USERNAME_PATTERN = /^[A-Za-zÇĞİÖŞÜçğıöşü][A-Za-z0-9_ÇĞİÖŞÜçğıöşü]{2,19}$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

/** The profile document at users/{uid}. Timestamps are Firestore server timestamps. */
export type UserProfile<Time = unknown> = {
  username: string;
  isGuest: boolean;
  locale: Locale;
  createdAt: Time;
  updatedAt: Time;
};

// Curated, harmless word lists for generated guest names (<Adjective><Noun><4 digits>).
// Every combination must stay within 16 letters so the name fits the 20-character limit.
const GUEST_WORDS: Record<Locale, { adjectives: string[]; nouns: string[] }> = {
  en: {
    adjectives: [
      'Brave',
      'Bright',
      'Calm',
      'Clever',
      'Cosmic',
      'Swift',
      'Happy',
      'Lucky',
      'Mighty',
      'Neon',
      'Pixel',
      'Quick',
      'Retro',
      'Sunny',
      'Turbo',
      'Witty',
    ],
    nouns: [
      'Comet',
      'Falcon',
      'Fox',
      'Koala',
      'Otter',
      'Panda',
      'Penguin',
      'Rocket',
      'Robot',
      'Tiger',
      'Wizard',
      'Dolphin',
      'Dragon',
      'Owl',
      'Lynx',
      'Meteor',
    ],
  },
  tr: {
    adjectives: [
      'Cesur',
      'Parlak',
      'Sakin',
      'Zeki',
      'Hızlı',
      'Mutlu',
      'Şanslı',
      'Güçlü',
      'Neşeli',
      'Çevik',
      'Yıldız',
      'Akıllı',
      'Kozmik',
      'Retro',
      'Turbo',
      'Uçan',
    ],
    nouns: [
      'Tilki',
      'Kartal',
      'Panda',
      'Penguen',
      'Roket',
      'Robot',
      'Kaplan',
      'Baykuş',
      'Yunus',
      'Ejder',
      'Şimşek',
      'Kirpi',
      'Aslan',
      'Sincap',
      'Kunduz',
      'Atmaca',
    ],
  },
};

/** A friendly random name for a new guest, e.g. "PixelFox4821" or "HızlıTilki4821". */
export function generateGuestName(locale: Locale, random: () => number = Math.random): string {
  const { adjectives, nouns } = GUEST_WORDS[locale];
  const pick = (list: string[]) => list[Math.floor(random() * list.length)]!;
  const digits = String(Math.floor(random() * 10_000)).padStart(4, '0');
  return `${pick(adjectives)}${pick(nouns)}${digits}`;
}

/** Exposed for tests that check every combination stays valid. */
export function allGuestWordPairs(locale: Locale): [string, string][] {
  const { adjectives, nouns } = GUEST_WORDS[locale];
  return adjectives.flatMap((adjective) =>
    nouns.map((noun): [string, string] => [adjective, noun]),
  );
}
