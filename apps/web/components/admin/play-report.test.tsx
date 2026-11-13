import type { PlayReport } from '@ayvago/shared';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import tr from '../../messages/tr.json';
import { Report } from './play-report';

// The report's tables rendered to markup (slice 5.28): one window, named by one note, and no
// all-time columns.

const counts = (starts: number, plays: number, onlinePlays: number, playSeconds: number) => ({
  starts,
  plays,
  onlinePlays,
  playSeconds,
  abandonedSeconds: 0,
  totalSeconds: playSeconds,
});

const report: PlayReport = {
  generatedAt: Date.parse('2026-11-13T09:30:00Z'),
  statsSince: '2026-11-07',
  extendedSince: '2026-11-10',
  summary: {
    google: { profiles: 2, players: 1, ...counts(9, 7, 3, 420) },
    registered: { profiles: 0, players: 0, ...counts(0, 0, 0, 0) },
    guest: { profiles: 3, players: 1, ...counts(0, 2, 0, 60) },
    unknown: { profiles: null, players: 0, ...counts(0, 0, 0, 0) },
  },
  games: [
    {
      gameId: 'snake',
      window: {
        started: 1234,
        finished: 987,
        playSeconds: 480,
        abandonedSeconds: 0,
        onlineStarted: 0,
      },
      playsByKind: { google: 7, registered: 0, guest: 2, unknown: 0 },
      playersByKind: { google: 1, registered: 0, guest: 1, unknown: 0 },
    },
  ],
  players: [
    {
      tag: 'AAAAA',
      username: 'Ayla',
      kind: 'google',
      ...counts(9, 7, 3, 420),
      lastPlayedAt: Date.parse('2026-11-12T09:00:00Z'),
      games: [{ gameId: 'snake', ...counts(9, 7, 0, 420) }],
    },
  ],
  playerCount: 1,
  truncated: 0,
};

function render(locale: 'en' | 'tr') {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : tr} timeZone="UTC">
      <Report report={report} titles={{ snake: 'Snake' }} />
    </NextIntlClientProvider>,
  );
}

/** The visible text of every heading cell of the n-th table. */
function headings(html: string, table: number) {
  const markup = html.split('<table').slice(1)[table]!.split('</thead>')[0]!;
  return [...markup.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1]!
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('play report tables', () => {
  it('names the one window in a small note (English)', () => {
    const html = render('en');
    const note = html.match(/<p class="[^"]*" data-testid="report-since">([\s\S]*?)<\/p>/)!;
    expect(note).not.toBeNull();
    expect(note[1]).toBe('Listed from November 7, 2026. * Counted from November 10, 2026.');
    // the old ranges paragraph and its "all time" columns are gone
    expect(html).not.toContain('report-ranges');
    expect(html).not.toContain('report-extended');
    expect(text(html)).not.toMatch(/all time|since/i);
  });

  it('names the one window in a small note (Turkish)', () => {
    const html = render('tr');
    expect(text(html)).toContain(
      '7 Kasım 2026 tarihinden itibaren listelenmiştir. * 10 Kasım 2026 tarihinden itibaren sayılır.',
    );
    expect(text(html)).not.toMatch(/tüm zamanlar|tarihinden beri/i);
  });

  it('shows one set of columns per table, the later ones marked', () => {
    const html = render('en');
    expect(headings(html, 0)).toEqual([
      'Player kind',
      'New profiles',
      'Players',
      'Starts*',
      'Plays',
      'Online*',
      'Play time',
    ]);
    expect(headings(html, 1)).toEqual([
      'Game',
      'Starts',
      'Finished',
      'Online matches*',
      'Play time',
      'Players',
      'Google',
      'Registered',
      'Guest',
      'Unknown',
    ]);
    expect(headings(html, 2)).toEqual([
      '#',
      'Player',
      'Kind',
      'Starts*',
      'Plays',
      'Online*',
      'Play time',
      'Last played',
      'Games',
    ]);
    // the per-game row shows the window's numbers
    const row = html.split('<tbody>')[2]!.split('</tr>')[0]!;
    expect(text(row).trim()).toBe('Snake 1,234 987 0 8 min 1 0 1 0');
    expect(html).toContain('Per player (1)');
  });

  it('keeps the column headings sortable', () => {
    const html = render('en');
    expect(html).toContain('aria-label="Sort by Finished, descending"');
    expect(html).toContain('aria-label="Sort by Google (Players), descending"');
  });
});
