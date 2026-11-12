// The top-bar slogan ticker (slice 5.27): the platform's slogans with thinkers' quotes mixed in,
// two slogans, then one quote, repeating. Pure, so the order and timing are unit-tested.

/** Slogans next to the logo (messages: slogans.*). */
export const SLOGAN_KEYS = [
  'count',
  'instant',
  'noDownload',
  'highScore',
  'genres',
  'leaderboard',
  'oneMore',
] as const;

/**
 * Quotes (messages: quotes.<key>.text and quotes.<key>.by), each checked against the primary
 * source named here; the English follows the translation named. Misattributed sayings (the
 * "hour of play" line credited to Plato, "It does not matter how slowly you go" credited to
 * Confucius) stay out. Keep each one at about 60 characters, so it fits the one-line ticker.
 */
export const QUOTE_KEYS = [
  // Laozi, Tao Te Ching, ch. 64 (the common rendering of Legge's "the journey of a thousand li
  // commences with a single step").
  'laozi',
  // Epictetus, Discourses 1.15.7 (tr. George Long).
  'epictetusGreat',
  // Marcus Aurelius, Meditations 5.20 (tr. Gregory Hays).
  'marcus',
  // Plato, Republic 2.377a-b (tr. Benjamin Jowett).
  'platoBeginning',
  // Periander, in Diogenes Laërtius, Lives of the Eminent Philosophers 1.99 (tr. R. D. Hicks:
  // "Practice is everything", μελέτη τὸ πᾶν).
  'periander',
  // Heraclitus, DK 22 B91, quoted in Plato, Cratylus 402a (tr. Jowett).
  'heraclitusRiver',
  // Seneca, Moral Letters to Lucilius 1.3 (tr. Richard M. Gummere).
  'senecaPostpone',
  // Publilius Syrus, Sententiae (The Moral Sayings of Publius Syrus, tr. Darius Lyman, 1856).
  'publiliusPractice',
  // Publilius Syrus, Sententiae, maxim 358 (tr. Lyman).
  'publiliusHelm',
  // Aristotle, Nicomachean Ethics 1.7, 1098a18 (tr. W. D. Ross).
  'aristotle',
  // Seneca, Moral Letters to Lucilius 7.8 (tr. Gummere: "homines dum docent discunt").
  'senecaTeach',
  // Heraclitus, DK 22 B52, quoted in Hippolytus, Refutation of All Heresies 9.9.4
  // (tr. Charles H. Kahn).
  'heraclitusPlay',
  // Epictetus, Discourses 2.18.2 (tr. Long).
  'epictetusReader',
  // Democritus, DK 68 B242, in Stobaeus, Anthology 2.31 (tr. Kathleen Freeman).
  'democritus',
  // Socrates, in Plato, Apology 38a (tr. Jowett).
  'socrates',
] as const;

export type TickerQuote = { text: string; by: string };
export type TickerItem = { kind: 'slogan'; text: string } | ({ kind: 'quote' } & TickerQuote);

/** How long a slogan and a quote stay on screen. */
export const SLOGAN_MS = 4000;
export const QUOTE_MS = 6000;

/** Slogans shown between two quotes. */
const SLOGANS_PER_QUOTE = 2;

/**
 * The item at `step` (0, 1, 2 …): two slogans, then a quote, repeating; slogans and quotes each
 * go round in their own order. Without quotes it is the slogans alone, and the other way round.
 */
export function tickerItem(
  step: number,
  slogans: string[],
  quotes: TickerQuote[],
): TickerItem | null {
  const n = Math.max(0, Math.floor(step));
  if (quotes.length === 0) {
    return slogans.length ? { kind: 'slogan', text: slogans[n % slogans.length]! } : null;
  }
  if (slogans.length === 0) return { kind: 'quote', ...quotes[n % quotes.length]! };
  const block = Math.floor(n / (SLOGANS_PER_QUOTE + 1));
  const position = n % (SLOGANS_PER_QUOTE + 1);
  if (position === SLOGANS_PER_QUOTE) return { kind: 'quote', ...quotes[block % quotes.length]! };
  return {
    kind: 'slogan',
    text: slogans[(block * SLOGANS_PER_QUOTE + position) % slogans.length]!,
  };
}

/** How long the item stays before the ticker moves on. */
export function tickerDuration(item: TickerItem | null): number {
  return item?.kind === 'quote' ? QUOTE_MS : SLOGAN_MS;
}
