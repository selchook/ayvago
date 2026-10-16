import { SUPPORTED_LOCALES } from '@ayvago/shared';
import { describe, expect, it } from 'vitest';
import en from './en.json';

// Flattens nested message objects into dotted key paths ("home.tagline").
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalogs', () => {
  const reference = keyPaths(en).sort();

  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))(
    '%s has exactly the same keys as en',
    async (locale) => {
      const messages = (await import(`./${locale}.json`)).default;
      expect(keyPaths(messages).sort()).toEqual(reference);
    },
  );

  it.each(SUPPORTED_LOCALES)('%s has no empty strings', async (locale) => {
    const messages = (await import(`./${locale}.json`)).default;
    const flat = keyPaths(messages).map((path) =>
      path
        .split('.')
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages),
    );
    expect(flat.every((text) => typeof text === 'string' && text.trim().length > 0)).toBe(true);
  });
});
