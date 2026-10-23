// Locale-aware score formatting, shared by the player, leaderboards and profiles.

export type ScoreFormat = 'number' | 'time';

// Time scores are reported in milliseconds and shown as m:ss.SSS (or h:mm:ss.SSS).
function formatTime(ms: number, locale: string): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = (total % 60_000) / 1000;
  const secondsText = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(seconds);
  const head = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}` : String(minutes);
  return `${head}:${secondsText}`;
}

export function formatScore(value: number, format: ScoreFormat, locale: string): string {
  return format === 'time'
    ? formatTime(value, locale)
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}
