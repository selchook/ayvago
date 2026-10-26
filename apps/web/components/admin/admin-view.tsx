'use client';

import { NEGATIVE_REASONS, likePercent } from '@ayvago/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  appCheckStatus,
  findPlayers,
  gameFeedback,
  gameNumbers,
  pendingFlags,
  reviewFlag,
  setAppCheckMode,
  setBan,
  type AppCheckStatus,
  type Feedback,
  type GameNumbers,
  type PlayerSummary,
  type ScoreFlag,
} from '@/lib/admin/queries';
import { refreshClaims, useAccount } from '@/lib/account/store';
import { formatScore, type ScoreFormat } from '@/lib/format';
import styles from './admin.module.css';

export type AdminGame = { gameId: string; title: string; scoreFormat: ScoreFormat };

type Tab = 'flags' | 'games' | 'feedback' | 'players' | 'appCheck';
// Reasons finishSession records on a flag (firebase/functions/src/sessions.ts judgeRun).
const FLAG_REASONS = ['too-fast', 'max-score', 'duration-mismatch', 'outlier'] as const;
type FlagReason = (typeof FLAG_REASONS)[number];
const TABS: Tab[] = ['flags', 'games', 'feedback', 'players', 'appCheck'];

/** Admin panel v1 (docs/plan/phase-2.md §2.3). Visible only with the `admin` claim. */
export function AdminView({ games }: { games: AdminGame[] }) {
  const t = useTranslations('admin');
  const account = useAccount();
  const [tab, setTab] = useState<Tab>('flags');
  const [checking, setChecking] = useState(false);

  if (account.status === 'loading') return <p role="status">{t('loading')}</p>;
  if (account.status !== 'signedIn' || !account.isAdmin) {
    return (
      <div className={styles.card}>
        <h1>{t('title')}</h1>
        <p>{t('notAdmin')}</p>
        {account.status === 'signedIn' && !account.isGuest ? (
          <button
            type="button"
            className={styles.button}
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await refreshClaims().catch(() => undefined);
              setChecking(false);
            }}
          >
            {t('refreshAccess')}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <h1>{t('title')}</h1>
      <div className={styles.tabs} role="tablist" aria-label={t('title')}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={styles.tab}
            onClick={() => setTab(key)}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>
      {tab === 'flags' ? <Flags games={games} /> : null}
      {tab === 'games' ? <Games games={games} /> : null}
      {tab === 'feedback' ? <FeedbackPanel games={games} /> : null}
      {tab === 'players' ? <Players /> : null}
      {tab === 'appCheck' ? <AppCheckPanel /> : null}
    </div>
  );
}

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(() => {
    setError(false);
    load()
      .then(setData)
      .catch((e) => {
        console.warn('[admin] load failed', e);
        setError(true);
      });
  }, [load]);
  useEffect(reload, [reload]);
  return { data, error, setData };
}

function Flags({ games }: { games: AdminGame[] }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const format = useFormatter();
  const { data, error, setData } = useLoad(pendingFlags);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const game = (id: string) => games.find((g) => g.gameId === id);

  async function act(flag: ScoreFlag, action: 'approve' | 'reject' | 'ban') {
    setBusy(flag.sessionId);
    try {
      await reviewFlag(flag.sessionId, action);
      setData((current) =>
        (current ?? []).filter((f) =>
          action === 'ban' ? f.uid !== flag.uid : f.sessionId !== flag.sessionId,
        ),
      );
      setMessage(t(`flags.done.${action}`, { name: flag.username }));
    } catch {
      setMessage(t('actionFailed'));
    } finally {
      setBusy(null);
      setConfirmBan(null);
    }
  }

  if (error) return <p className={styles.note}>{t('loadFailed')}</p>;
  if (!data) return <p role="status">{t('loading')}</p>;
  return (
    <section className={styles.card} aria-labelledby="flags-heading">
      <h2 id="flags-heading">{t('flags.title', { count: data.length })}</h2>
      <p className={styles.note}>{t('flags.intro')}</p>
      {message ? (
        <p role="status" className={styles.message}>
          {message}
        </p>
      ) : null}
      {data.length === 0 ? <p>{t('flags.empty')}</p> : null}
      <ul className={styles.list}>
        {data.map((flag) => {
          const g = game(flag.gameId);
          return (
            <li key={flag.sessionId} className={styles.item}>
              <div className={styles.itemMain}>
                <strong>
                  {g?.title ?? flag.gameId}:{' '}
                  {formatScore(flag.score, g?.scoreFormat ?? 'number', locale)}
                </strong>
                <span>
                  {flag.username}
                  {flag.isGuest ? ` · ${t('guest')}` : ''} ·{' '}
                  {format.dateTime(flag.achievedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <span className={styles.note}>
                  {t('flags.durations', {
                    server: Math.round(flag.serverDurationMs / 1000),
                    client: Math.round(flag.durationMs / 1000),
                  })}
                </span>
                <span className={styles.chips}>
                  {flag.reasons.map((reason) => (
                    <span key={reason} className={styles.chip}>
                      {FLAG_REASONS.includes(reason as FlagReason)
                        ? t(`flags.reasons.${reason as FlagReason}`)
                        : reason}
                    </span>
                  ))}
                  {flag.continued ? (
                    <span className={styles.chip}>{t('flags.continued')}</span>
                  ) : null}
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy !== null}
                  onClick={() => act(flag, 'approve')}
                >
                  {t('flags.approve')}
                </button>
                <button
                  type="button"
                  className={styles.plain}
                  disabled={busy !== null}
                  onClick={() => act(flag, 'reject')}
                >
                  {t('flags.reject')}
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  disabled={busy !== null}
                  onClick={() =>
                    confirmBan === flag.sessionId ? act(flag, 'ban') : setConfirmBan(flag.sessionId)
                  }
                >
                  {confirmBan === flag.sessionId ? t('flags.confirmBan') : t('flags.ban')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Games({ games }: { games: AdminGame[] }) {
  const t = useTranslations('admin');
  const format = useFormatter();
  const load = useCallback(() => gameNumbers(games.map((g) => g.gameId)), [games]);
  const { data, error } = useLoad(load);
  if (error) return <p className={styles.note}>{t('loadFailed')}</p>;
  if (!data) return <p role="status">{t('loading')}</p>;
  const score = (value: number | null) =>
    value === null ? '–' : format.number(value, { maximumFractionDigits: 3 });
  return (
    <section className={styles.card} aria-labelledby="games-heading">
      <h2 id="games-heading">{t('games.title')}</h2>
      <p className={styles.note}>{t('games.intro')}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('games.game')}</th>
              <th scope="col">{t('games.plays7d')}</th>
              <th scope="col">{t('games.votes')}</th>
              <th scope="col">{t('games.quality')}</th>
              <th scope="col">{t('games.trend')}</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => {
              const n: GameNumbers | undefined = data[g.gameId];
              const percent = n ? likePercent(n.likes, n.dislikes) : null;
              return (
                <tr key={g.gameId}>
                  <th scope="row">{g.title}</th>
                  <td>{format.number(n?.plays7d ?? 0)}</td>
                  <td>
                    👍 {format.number(n?.likes ?? 0)} · 👎 {format.number(n?.dislikes ?? 0)}
                    {percent !== null ? ` (${percent}%)` : ''}
                  </td>
                  <td>{score(n?.qualityScore ?? null)}</td>
                  <td>{score(n?.trendScore ?? null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FeedbackPanel({ games }: { games: AdminGame[] }) {
  const t = useTranslations('admin');
  const tv = useTranslations('vote');
  const format = useFormatter();
  const [gameId, setGameId] = useState(games[0]?.gameId ?? '');
  const load = useCallback(() => gameFeedback(gameId), [gameId]);
  const { data, error } = useLoad<Feedback>(load);
  return (
    <section className={styles.card} aria-labelledby="feedback-heading">
      <h2 id="feedback-heading">{t('feedback.title')}</h2>
      <label className={styles.field}>
        <span>{t('games.game')}</span>
        <select value={gameId} onChange={(event) => setGameId(event.target.value)}>
          {games.map((g) => (
            <option key={g.gameId} value={g.gameId}>
              {g.title}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className={styles.note}>{t('loadFailed')}</p> : null}
      {!data && !error ? <p role="status">{t('loading')}</p> : null}
      {data ? (
        <>
          <p>{t('feedback.count', { count: data.count })}</p>
          <ul className={styles.bars}>
            {NEGATIVE_REASONS.map((reason) => (
              <li key={reason}>
                <span>{tv(`reasons.${reason}`)}</span>
                <meter min={0} max={Math.max(1, data.count)} value={data.reasons[reason]} />
                <span>{format.number(data.reasons[reason])}</span>
              </li>
            ))}
          </ul>
          <h3>{t('feedback.comments')}</h3>
          {data.comments.length === 0 ? (
            <p className={styles.note}>{t('feedback.noComments')}</p>
          ) : null}
          <ul className={styles.list}>
            {data.comments.map((comment, i) => (
              <li key={i} className={styles.comment}>
                <q>{comment.text}</q>
                <span className={styles.note}>
                  {format.dateTime(comment.at, { dateStyle: 'medium' })}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Players() {
  const t = useTranslations('admin');
  const format = useFormatter();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PlayerSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setResults(await findPlayers(term).catch(() => []));
    setBusy(false);
  }

  async function toggle(player: PlayerSummary) {
    setBusy(true);
    try {
      await setBan(player.uid, !player.banned);
      setResults((current) =>
        (current ?? []).map((p) => (p.uid === player.uid ? { ...p, banned: !p.banned } : p)),
      );
      setMessage(
        t(player.banned ? 'players.unbanned' : 'players.banned', { name: player.username }),
      );
    } catch {
      setMessage(t('actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="players-heading">
      <h2 id="players-heading">{t('players.title')}</h2>
      <form className={styles.search} onSubmit={search}>
        <label className={styles.field}>
          <span>{t('players.search')}</span>
          <input value={term} onChange={(event) => setTerm(event.target.value)} />
        </label>
        <button type="submit" className={styles.button} disabled={busy || !term.trim()}>
          {t('players.find')}
        </button>
      </form>
      {message ? (
        <p role="status" className={styles.message}>
          {message}
        </p>
      ) : null}
      {results && results.length === 0 ? <p>{t('players.none')}</p> : null}
      <ul className={styles.list}>
        {(results ?? []).map((player) => (
          <li key={player.uid} className={styles.item}>
            <div className={styles.itemMain}>
              <strong>
                {player.username}
                {player.isGuest ? ` · ${t('guest')}` : ''}
                {player.banned ? ` · ${t('players.bannedBadge')}` : ''}
              </strong>
              <span className={styles.note}>
                {player.uid}
                {player.createdAt
                  ? ` · ${t('players.joined', { date: format.dateTime(player.createdAt, { dateStyle: 'medium' }) })}`
                  : ''}
              </span>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={player.banned ? styles.plain : styles.danger}
                disabled={busy}
                onClick={() => toggle(player)}
              >
                {player.banned ? t('players.unban') : t('players.ban')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * App Check rollout: the share of the last day's score sessions that carried a verified token,
 * and the switch between monitoring and enforcing (docs/setup/phase-2.md §2).
 */
function AppCheckPanel() {
  const t = useTranslations('admin.appCheck');
  const ta = useTranslations('admin');
  const format = useFormatter();
  const { data, error, setData } = useLoad<AppCheckStatus>(appCheckStatus);
  const [busy, setBusy] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function change(mode: 'monitor' | 'enforce', force = false) {
    setBusy(true);
    setMessage(null);
    try {
      setData(await setAppCheckMode(mode, force));
      setMessage(t(mode === 'enforce' ? 'enforced' : 'monitoring'));
    } catch (e) {
      const reason = (e as { details?: { reason?: string } }).details?.reason;
      setMessage(reason === 'not-ready' ? t('notReady') : ta('actionFailed'));
    } finally {
      setBusy(false);
      setConfirmForce(false);
    }
  }

  if (error) return <p className={styles.note}>{ta('loadFailed')}</p>;
  if (!data) return <p role="status">{ta('loading')}</p>;
  const share = data.sessions > 0 ? data.verified / data.sessions : 0;
  return (
    <section className={styles.card} aria-labelledby="appcheck-heading">
      <h2 id="appcheck-heading">{t('title')}</h2>
      <p className={styles.note}>{t('intro')}</p>
      <p>
        <strong>{data.mode === 'enforce' ? t('modeEnforce') : t('modeMonitor')}</strong>
      </p>
      <p data-testid="appcheck-share">
        {t('share', {
          verified: format.number(data.verified),
          sessions: format.number(data.sessions),
          percent: format.number(share, { style: 'percent', maximumFractionDigits: 1 }),
        })}
      </p>
      <p className={styles.note}>{data.ready ? t('ready') : t('notReadyHint')}</p>
      {message ? (
        <p role="status" className={styles.message}>
          {message}
        </p>
      ) : null}
      <div className={styles.actions}>
        {data.mode === 'monitor' ? (
          <>
            <button
              type="button"
              className={styles.button}
              disabled={busy || !data.ready}
              onClick={() => change('enforce')}
            >
              {t('enforce')}
            </button>
            {!data.ready ? (
              <button
                type="button"
                className={styles.danger}
                disabled={busy}
                onClick={() => (confirmForce ? change('enforce', true) : setConfirmForce(true))}
              >
                {confirmForce ? t('confirmForce') : t('force')}
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className={styles.plain}
            disabled={busy}
            onClick={() => change('monitor')}
          >
            {t('monitor')}
          </button>
        )}
      </div>
    </section>
  );
}
