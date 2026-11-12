import { describe, expect, it } from 'vitest';
import enMessages from '../../messages/en.json';
import trMessages from '../../messages/tr.json';
import { QUOTE_KEYS, QUOTE_MS, SLOGAN_KEYS, SLOGAN_MS, tickerDuration, tickerItem } from './ticker';

const slogans = ['s1', 's2', 's3'];
const quotes = [
  { text: 'q1', by: 'A' },
  { text: 'q2', by: 'B' },
];
const label = (step: number) => {
  const item = tickerItem(step, slogans, quotes)!;
  return item.kind === 'quote' ? `${item.text}/${item.by}` : item.text;
};

describe('tickerItem', () => {
  it('shows two slogans, then one quote, repeating', () => {
    expect(Array.from({ length: 12 }, (_, step) => label(step))).toEqual([
      's1',
      's2',
      'q1/A',
      's3',
      's1',
      'q2/B',
      's2',
      's3',
      'q1/A',
      's1',
      's2',
      'q2/B',
    ]);
  });

  it('shows the slogans alone without quotes, the quotes alone without slogans', () => {
    expect([0, 1, 2, 3].map((step) => tickerItem(step, slogans, [])?.text)).toEqual([
      's1',
      's2',
      's3',
      's1',
    ]);
    expect([0, 1, 2].map((step) => tickerItem(step, [], quotes)?.text)).toEqual(['q1', 'q2', 'q1']);
    expect(tickerItem(0, [], [])).toBeNull();
  });

  it('keeps quotes on screen 6 s and slogans 4 s', () => {
    expect(QUOTE_MS).toBe(6000);
    expect(SLOGAN_MS).toBe(4000);
    expect(tickerDuration(tickerItem(2, slogans, quotes))).toBe(6000);
    expect(tickerDuration(tickerItem(0, slogans, quotes))).toBe(4000);
    expect(tickerDuration(null)).toBe(4000);
  });
});

describe('ticker messages', () => {
  type Quote = { text: string; by: string };
  const sets = { en: enMessages, tr: trMessages } as unknown as Record<
    string,
    { slogans: Record<string, string>; quotes: Record<string, Quote | string> }
  >;

  it.each(Object.keys(sets))('has every slogan and a short, attributed quote in %s', (locale) => {
    const messages = sets[locale]!;
    for (const key of SLOGAN_KEYS) expect(messages.slogans[key]).toBeTruthy();
    expect(QUOTE_KEYS.length).toBeGreaterThanOrEqual(12);
    for (const key of QUOTE_KEYS) {
      const quote = messages.quotes[key] as Quote;
      expect(quote.by.length).toBeGreaterThan(1);
      // One line in the desktop ticker.
      expect(quote.text.length).toBeLessThanOrEqual(60);
    }
  });
});
