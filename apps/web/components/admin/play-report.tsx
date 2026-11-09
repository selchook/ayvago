'use client';

import { PLAYER_KINDS, type PlayerKind, type PlayReport } from '@ayvago/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { downloadCsv } from '@/lib/admin/csv';
import { gameCsvRows, playerCsvRows, splitDuration } from '@/lib/admin/play-report';
import { playReport } from '@/lib/admin/queries';
import styles from './admin.module.css';

/**
 * "Players and plays" (slice 5.16): who played, by player kind, and which games how often.
 * Built by the getPlayReport function only when the admin asks for it.
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

function Report({ report, titles }: { report: PlayReport; titles: Record<string, string> }) {
  const t = useTranslations('admin.report');
  const format = useFormatter();
  const title = (gameId: string) => titles[gameId] ?? gameId;
  const kind = (k: PlayerKind) => t(`kinds.${k}`);
  // statsSince and allTimeSince are UTC days
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const duration = (seconds: number) => {
    const { hours, minutes } = splitDuration(seconds);
    return hours > 0 ? t('duration.hours', { hours, minutes }) : t('duration.minutes', { minutes });
  };
  const n = (value: number) => format.number(value);
  const gameLine = (g: { gameId: string; plays: number }) =>
    t('players.gameLine', { game: title(g.gameId), count: g.plays });

  const since = day(report.statsSince);
  const totals = PLAYER_KINDS.reduce(
    (sum, k) => {
      const row = report.summary[k];
      return {
        profiles: sum.profiles + (row.profiles ?? 0),
        players: sum.players + row.players,
        plays: sum.plays + row.plays,
        playSeconds: sum.playSeconds + row.playSeconds,
      };
    },
    { profiles: 0, players: 0, plays: 0, playSeconds: 0 },
  );

  function downloadGames() {
    downloadCsv(
      `ayvago-games-${report.statsSince}-${fileStamp(report.generatedAt)}.csv`,
      gameCsvRows(report, title, {
        game: t('games.game'),
        gameId: t('csv.gameId'),
        allTimeFinished: t('csv.allTimeFinished'),
        allTimeStarted: t('csv.allTimeStarted'),
        allTimeSeconds: t('csv.allTimeSeconds'),
        plays: t('games.plays', { since }),
        seconds: t('csv.seconds', { since }),
        playsByKind: byKind((k) => t('csv.playsKind', { kind: kind(k) })),
        playersByKind: byKind((k) => t('csv.playersKind', { kind: kind(k) })),
      }),
    );
  }

  function downloadPlayers() {
    downloadCsv(
      `ayvago-players-${report.statsSince}-${fileStamp(report.generatedAt)}.csv`,
      playerCsvRows(report, title, kind, t('players.noName'), {
        rank: t('players.rank'),
        player: t('players.player'),
        tag: t('csv.tag'),
        kind: t('players.kind'),
        plays: t('players.plays'),
        seconds: t('csv.playerSeconds'),
        lastPlayed: t('csv.lastPlayed'),
        games: t('players.games'),
      }),
    );
  }

  return (
    <>
      <p data-testid="report-ranges">
        {report.allTimeSince
          ? t('ranges', { since, allTime: day(report.allTimeSince) })
          : t('rangesNoAllTime', { since })}
      </p>
      <p className={styles.note}>{t('kindsNote')}</p>

      <h3>{t('summary.title')}</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>
                {t('summary.kind')}
              </th>
              <th scope="col" rowSpan={2} className={styles.num}>
                {t('summary.profiles')}
              </th>
              <th scope="colgroup" colSpan={3} className={styles.group}>
                {t('games.sinceGroup', { since })}
              </th>
            </tr>
            <tr>
              <th scope="col" className={styles.num}>
                {t('summary.players')}
              </th>
              <th scope="col" className={styles.num}>
                {t('summary.plays')}
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
                  <td className={styles.num}>{n(row.plays)}</td>
                  <td className={styles.num}>{duration(row.playSeconds)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t('summary.total')}</th>
              <td className={styles.num}>{n(totals.profiles)}</td>
              <td className={styles.num}>{n(totals.players)}</td>
              <td className={styles.num}>{n(totals.plays)}</td>
              <td className={styles.num}>{duration(totals.playSeconds)}</td>
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
                <th scope="col" rowSpan={2}>
                  {t('games.game')}
                </th>
                <th scope="colgroup" colSpan={2} className={styles.group}>
                  {t('games.allTime', { allTime: day(report.allTimeSince ?? report.statsSince) })}
                </th>
                <th scope="colgroup" colSpan={2} className={styles.group}>
                  {t('games.sinceGroup', { since })}
                </th>
                <th scope="colgroup" colSpan={PLAYER_KINDS.length} className={styles.group}>
                  {t('games.playersGroup', { since })}
                </th>
              </tr>
              <tr>
                <th scope="col" className={styles.num}>
                  {t('games.allTimeRuns')}
                </th>
                <th scope="col" className={styles.num}>
                  {t('games.allTimeStarts')}
                </th>
                <th scope="col" className={styles.num}>
                  {t('games.playsShort')}
                </th>
                <th scope="col" className={styles.num}>
                  {t('games.time')}
                </th>
                {PLAYER_KINDS.map((k) => (
                  <th key={k} scope="col" className={styles.num}>
                    {kind(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.games.map((g) => (
                <tr key={g.gameId}>
                  <th scope="row">{title(g.gameId)}</th>
                  <td className={styles.num}>{n(g.allTime.finished)}</td>
                  <td className={styles.num}>{n(g.allTime.started)}</td>
                  <td className={styles.num}>{n(g.plays)}</td>
                  <td className={styles.num}>{duration(g.playSeconds)}</td>
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
        <h3>{t('players.title', { count: report.playerCount, since })}</h3>
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
        <p className={styles.note}>{t('players.empty', { since })}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.top}`}>
            <thead>
              <tr>
                <th scope="col" className={styles.num}>
                  {t('players.rank')}
                </th>
                <th scope="col">{t('players.player')}</th>
                <th scope="col">{t('players.kind')}</th>
                <th scope="col" className={styles.num}>
                  {t('players.plays')}
                </th>
                <th scope="col" className={styles.num}>
                  {t('players.time')}
                </th>
                <th scope="col">{t('players.lastPlayed')}</th>
                <th scope="col">{t('players.games')}</th>
              </tr>
            </thead>
            <tbody>
              {report.players.map((p, i) => (
                <tr key={`${i}-${p.tag}`}>
                  <td className={styles.num}>{n(i + 1)}</td>
                  <th scope="row">
                    {p.username ?? t('players.noName')} <span className={styles.tag}>#{p.tag}</span>
                  </th>
                  <td>{kind(p.kind)}</td>
                  <td className={styles.num}>{n(p.plays)}</td>
                  <td className={styles.num}>{duration(p.playSeconds)}</td>
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

/** 2026-11-09T15-04 (UTC) for file names. */
const fileStamp = (time: number) => new Date(time).toISOString().slice(0, 16).replace(':', '-');
