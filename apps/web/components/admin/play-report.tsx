'use client';

import {
  PLAYER_KINDS,
  type GameReport,
  type PlayerGame,
  type PlayerKind,
  type PlayerReport,
  type PlayReport,
} from '@ayvago/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { downloadCsv } from '@/lib/admin/csv';
import { gameCsvRows, playerCsvRows, reportFileName, splitDuration } from '@/lib/admin/play-report';
import { playReport } from '@/lib/admin/queries';
import styles from './admin.module.css';
import { SortableTh } from './sortable-th';
import { useTableSort, type SortColumn } from './use-table-sort';

/**
 * "Players and plays" (slices 5.16 and 5.22): who played, by player kind, and which games how
 * often: runs started, finished and left, online matches and play time.
 * Built by the getPlayReport function only when the admin asks for it. The per-game and per-player
 * tables sort by a click on a column heading (slice 5.25). Every number covers one window, from
 * `statsSince` on, which one small note above the tables names (slice 5.28).
 */
export function PlayReportPanel({ titles }: { titles: Record<string, string> }) {
  const t = useTranslations('admin.report');
  const format = useFormatter();
  const [report, setReport] = useState<PlayReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState('');

  async function run() {
    setBusy(true);
    setFailed(false);
    setDetail('');
    try {
      setReport(await playReport());
    } catch (e) {
      console.warn('[admin] play report failed', e);
      // the function's own reason (admins only), so a failure can be fixed without the logs
      const err = e as { code?: unknown; message?: unknown; details?: unknown };
      const extra =
        err.details && typeof err.details === 'object' ? JSON.stringify(err.details) : '';
      setDetail(
        [err.code, err.message, extra].filter(Boolean).map(String).join(' · ').slice(0, 500),
      );
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="report-heading" aria-busy={busy}>
      <h2 id="report-heading">{t('title')}</h2>
      <p className={styles.note}>{t('intro')}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={busy} onClick={run}>
          {busy ? t('running') : report ? t('rerun') : t('run')}
        </button>
        {report && !busy ? (
          <span className={styles.note}>
            {t('generated', {
              time: format.dateTime(report.generatedAt, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </span>
        ) : null}
      </div>
      {busy ? (
        <p role="status" className={styles.note}>
          {t('runningHint')}
        </p>
      ) : null}
      {failed ? (
        <div role="alert">
          <p className={styles.message}>{t('failed')}</p>
          {detail ? (
            <p className={styles.note}>
              {t('failedDetail')} <code>{detail}</code>
            </p>
          ) : null}
        </div>
      ) : null}
      {report ? <Report report={report} titles={titles} /> : null}
    </section>
  );
}

/** The report's tables, exported for the component test. */
export function Report({ report, titles }: { report: PlayReport; titles: Record<string, string> }) {
  const t = useTranslations('admin.report');
  const format = useFormatter();
  const title = (gameId: string) => titles[gameId] ?? gameId;
  const kind = (k: PlayerKind) => t(`kinds.${k}`);
  // statsSince and extendedSince are UTC days
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' });
  const duration = (seconds: number) => {
    const { hours, minutes } = splitDuration(seconds);
    return hours > 0 ? t('duration.hours', { hours, minutes }) : t('duration.minutes', { minutes });
  };
  const n = (value: number) => format.number(value);
  // "Okey · online × 7"; runs that were only started show how many, so no line reads "× 0".
  const gameLine = (g: PlayerGame) =>
    t('players.gameLine', {
      game: title(g.gameId),
      finished: g.plays,
      online: g.onlinePlays,
      started: g.plays === 0 && g.onlinePlays === 0 ? g.starts : 0,
    });

  // Without a chosen sort the tables keep the server's order: games by finished runs and online
  // matches, players by plays and online matches (buildPlayReport).
  const games = useTableSort('report.games', report.games, {
    game: { kind: 'text', value: (g) => title(g.gameId) },
    starts: { kind: 'number', value: (g) => g.window.started },
    finished: { kind: 'number', value: (g) => g.window.finished },
    online: { kind: 'number', value: (g) => g.window.onlineStarted },
    time: {
      kind: 'duration',
      value: (g) => g.window.playSeconds + g.window.abandonedSeconds,
    },
    ...(Object.fromEntries(
      PLAYER_KINDS.map((k) => [
        `players.${k}`,
        { kind: 'number', value: (g: GameReport) => g.playersByKind[k] },
      ]),
    ) as Record<`players.${PlayerKind}`, SortColumn<GameReport>>),
  });
  const players = useTableSort('report.players', report.players, {
    // players without a profile have no name and come last
    player: { kind: 'text', value: (p: PlayerReport) => p.username },
    kind: { kind: 'text', value: (p: PlayerReport) => kind(p.kind) },
    starts: { kind: 'number', value: (p: PlayerReport) => p.starts },
    plays: { kind: 'number', value: (p: PlayerReport) => p.plays },
    online: { kind: 'number', value: (p: PlayerReport) => p.onlinePlays },
    time: { kind: 'duration', value: (p: PlayerReport) => p.totalSeconds },
    lastPlayed: { kind: 'date', value: (p: PlayerReport) => p.lastPlayedAt },
  });
  // React keys that follow a player when the rows move (tags alone may repeat)
  const playerKeys = new Map(report.players.map((p, i) => [p, `${p.tag}-${i}`]));

  const since = day(report.statsSince);
  // The players-per-kind group, added to the sort buttons' names of the kind columns.
  const playersGroup = t('games.playersGroup');
  const extended = day(report.extendedSince);
  // Columns counted only from slice 5.22 on carry this mark; the note above the tables explains it.
  const later = (label: string) => (
    <>
      {label}
      <span className={styles.mark} aria-hidden="true">
        *
      </span>
    </>
  );
  const totals = PLAYER_KINDS.reduce(
    (sum, k) => {
      const row = report.summary[k];
      return {
        profiles: sum.profiles + (row.profiles ?? 0),
        players: sum.players + row.players,
        starts: sum.starts + row.starts,
        plays: sum.plays + row.plays,
        onlinePlays: sum.onlinePlays + row.onlinePlays,
        totalSeconds: sum.totalSeconds + row.totalSeconds,
      };
    },
    { profiles: 0, players: 0, starts: 0, plays: 0, onlinePlays: 0, totalSeconds: 0 },
  );

  function downloadGames() {
    downloadCsv(
      reportFileName('games', report.statsSince, report.generatedAt),
      gameCsvRows(games.rows, title, {
        game: t('games.game'),
        gameId: t('csv.gameId'),
        started: t('csv.gameStarts'),
        finished: t('csv.finished'),
        online: t('csv.online', { extended }),
        seconds: t('csv.finishedSeconds'),
        abandonedSeconds: t('csv.abandonedSeconds', { extended }),
        playsByKind: byKind((k) => t('csv.playsKind', { kind: kind(k) })),
        playersByKind: byKind((k) => t('csv.playersKind', { kind: kind(k) })),
      }),
    );
  }

  function downloadPlayers() {
    downloadCsv(
      reportFileName('players', report.statsSince, report.generatedAt),
      playerCsvRows(players.rows, gameLine, kind, t('players.noName'), {
        rank: t('players.rank'),
        player: t('players.player'),
        tag: t('csv.tag'),
        kind: t('players.kind'),
        starts: t('csv.starts', { extended }),
        plays: t('players.plays'),
        online: t('csv.online', { extended }),
        seconds: t('csv.finishedSeconds'),
        abandonedSeconds: t('csv.abandonedSeconds', { extended }),
        totalSeconds: t('csv.totalSeconds'),
        lastPlayed: t('csv.lastPlayed'),
        games: t('players.games'),
      }),
    );
  }

  return (
    <>
      <p className={styles.note} data-testid="report-since">
        {t('since', { since })} {t('laterNote', { extended })}
      </p>
      <p className={styles.note}>{t('kindsNote')}</p>

      <h3>{t('summary.title')}</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('summary.kind')}</th>
              <th scope="col" className={styles.num}>
                {t('summary.profiles')}
              </th>
              <th scope="col" className={styles.num}>
                {t('summary.players')}
              </th>
              <th scope="col" className={styles.num}>
                {later(t('summary.starts'))}
              </th>
              <th scope="col" className={styles.num}>
                {t('summary.plays')}
              </th>
              <th scope="col" className={styles.num}>
                {later(t('summary.online'))}
              </th>
              <th scope="col" className={styles.num}>
                {t('summary.time')}
              </th>
            </tr>
          </thead>
          <tbody>
            {PLAYER_KINDS.map((k) => {
              const row = report.summary[k];
              return (
                <tr key={k}>
                  <th scope="row">{kind(k)}</th>
                  <td className={styles.num}>{row.profiles === null ? '–' : n(row.profiles)}</td>
                  <td className={styles.num}>{n(row.players)}</td>
                  <td className={styles.num}>{n(row.starts)}</td>
                  <td className={styles.num}>{n(row.plays)}</td>
                  <td className={styles.num}>{n(row.onlinePlays)}</td>
                  <td className={styles.num}>{duration(row.totalSeconds)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t('summary.total')}</th>
              <td className={styles.num}>{n(totals.profiles)}</td>
              <td className={styles.num}>{n(totals.players)}</td>
              <td className={styles.num}>{n(totals.starts)}</td>
              <td className={styles.num}>{n(totals.plays)}</td>
              <td className={styles.num}>{n(totals.onlinePlays)}</td>
              <td className={styles.num}>{duration(totals.totalSeconds)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={styles.sectionHead}>
        <h3>{t('games.title')}</h3>
        {report.games.length > 0 ? (
          <button type="button" className={styles.plain} onClick={downloadGames}>
            {t('csv.download')}
          </button>
        ) : null}
      </div>
      {report.games.length === 0 ? (
        <p className={styles.note}>{t('games.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableTh label={t('games.game')} rowSpan={2} {...games.heading('game')} />
                <SortableTh
                  label={t('games.starts')}
                  className={styles.num}
                  rowSpan={2}
                  {...games.heading('starts')}
                />
                <SortableTh
                  label={t('games.finished')}
                  className={styles.num}
                  rowSpan={2}
                  {...games.heading('finished')}
                />
                <SortableTh
                  label={t('games.online')}
                  className={styles.num}
                  rowSpan={2}
                  {...games.heading('online')}
                >
                  {later(t('games.online'))}
                </SortableTh>
                <SortableTh
                  label={t('games.time')}
                  className={styles.num}
                  rowSpan={2}
                  {...games.heading('time')}
                />
                <th scope="colgroup" colSpan={PLAYER_KINDS.length} className={styles.group}>
                  {playersGroup}
                </th>
              </tr>
              <tr>
                {PLAYER_KINDS.map((k) => (
                  <SortableTh
                    key={k}
                    label={kind(k)}
                    className={styles.num}
                    group={playersGroup}
                    {...games.heading(`players.${k}`)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {games.rows.map((g) => (
                <tr key={g.gameId}>
                  <th scope="row">{title(g.gameId)}</th>
                  <td className={styles.num}>{n(g.window.started)}</td>
                  <td className={styles.num}>{n(g.window.finished)}</td>
                  <td className={styles.num}>{n(g.window.onlineStarted)}</td>
                  <td className={styles.num}>
                    {duration(g.window.playSeconds + g.window.abandonedSeconds)}
                  </td>
                  {PLAYER_KINDS.map((k) => (
                    <td key={k} className={styles.num}>
                      {n(g.playersByKind[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.sectionHead}>
        <h3>{t('players.title', { count: report.playerCount })}</h3>
        {report.players.length > 0 ? (
          <button type="button" className={styles.plain} onClick={downloadPlayers}>
            {t('csv.download')}
          </button>
        ) : null}
      </div>
      {report.truncated > 0 ? (
        <p className={styles.note}>
          {t('players.truncated', {
            shown: report.players.length,
            count: report.playerCount,
          })}
        </p>
      ) : null}
      {report.players.length === 0 ? (
        <p className={styles.note}>{t('players.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.top}`}>
            <thead>
              <tr>
                <th scope="col" className={styles.num}>
                  {t('players.rank')}
                </th>
                <SortableTh label={t('players.player')} {...players.heading('player')} />
                <SortableTh label={t('players.kind')} {...players.heading('kind')} />
                <SortableTh
                  label={t('players.starts')}
                  className={styles.num}
                  {...players.heading('starts')}
                >
                  {later(t('players.starts'))}
                </SortableTh>
                <SortableTh
                  label={t('players.plays')}
                  className={styles.num}
                  {...players.heading('plays')}
                />
                <SortableTh
                  label={t('players.online')}
                  className={styles.num}
                  {...players.heading('online')}
                >
                  {later(t('players.online'))}
                </SortableTh>
                <SortableTh
                  label={t('players.time')}
                  className={styles.num}
                  {...players.heading('time')}
                />
                <SortableTh label={t('players.lastPlayed')} {...players.heading('lastPlayed')} />
                <th scope="col">{t('players.games')}</th>
              </tr>
            </thead>
            <tbody>
              {players.rows.map((p, i) => (
                <tr key={playerKeys.get(p)}>
                  <td className={styles.num}>{n(i + 1)}</td>
                  <th scope="row">
                    {p.username ?? t('players.noName')} <span className={styles.tag}>#{p.tag}</span>
                  </th>
                  <td>{kind(p.kind)}</td>
                  <td className={styles.num}>{n(p.starts)}</td>
                  <td className={styles.num}>{n(p.plays)}</td>
                  <td className={styles.num}>{n(p.onlinePlays)}</td>
                  <td className={styles.num}>{duration(p.totalSeconds)}</td>
                  <td>
                    {p.lastPlayedAt === null
                      ? '–'
                      : format.dateTime(p.lastPlayedAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                  </td>
                  <td className={styles.gamesCell}>
                    {p.games.length === 1 ? (
                      gameLine(p.games[0]!)
                    ) : (
                      <details className={styles.details}>
                        <summary>
                          {t('players.gamesSummary', {
                            count: p.games.length,
                            first: gameLine(p.games[0]!),
                          })}
                        </summary>
                        <ul className={styles.gameList}>
                          {p.games.map((g) => (
                            <li key={g.gameId}>{gameLine(g)}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const byKind = (label: (k: PlayerKind) => string) =>
  Object.fromEntries(PLAYER_KINDS.map((k) => [k, label(k)])) as Record<PlayerKind, string>;
