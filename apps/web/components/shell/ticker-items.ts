import { getTranslations } from 'next-intl/server';
import { QUOTE_KEYS, SLOGAN_KEYS, type TickerQuote } from '@/lib/shell/ticker';

/** The ticker's localized slogans and quotes (messages: slogans.*, quotes.*). */
export async function getTickerContent(gameCount: number): Promise<{
  slogans: string[];
  quotes: TickerQuote[];
  attribution: string;
}> {
  const [ts, tq] = await Promise.all([getTranslations('slogans'), getTranslations('quotes')]);
  return {
    slogans: SLOGAN_KEYS.map((key) => ts(key, { count: gameCount })),
    quotes: QUOTE_KEYS.map((key) => ({ text: tq(`${key}.text`), by: tq(`${key}.by`) })),
    attribution: tq.raw('attribution') as string,
  };
}
