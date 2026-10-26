'use client';

import type { Locale } from '@ayvago/shared';
import { gameTokens } from '@ayvago/themes';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildStartConfig,
  isTrustedGameMessage,
  originOf,
  parseGameMessage,
  type PlatformMessage,
} from '@/lib/gha/bridge';
import { formatScore, type ScoreFormat } from '@/lib/format';
import { ensureGuest } from '@/lib/account/store';
import { beginRun, type Run, type RunResult } from '@/lib/leaderboard/session';
import { recordBestScore, recordPlay, useBestScore } from '@/lib/library';
import { readThemeState, THEME_CHANGE_EVENT, type ThemeState } from '@/lib/theme-client';
import {
  CollapseIcon,
  ExpandIcon,
  MuteIcon,
  PlayIcon,
  ShareIcon,
  TheaterIcon,
  VolumeIcon,
} from '../icons';
import { FavoriteButton } from './favorite-button';
import styles from './game.module.css';

type Phase = 'cover' | 'loading' | 'playing';

// Games without the SDK never send GHA_READY; after the iframe loads we show them anyway.
const NON_SDK_GRACE_MS = 1500;
// When a game takes this long, offer a reload.
const SLOW_LOAD_MS = 12_000;

export type GamePlayerProps = {
  slug: string;
  /** Manifest id: the game's key for score sessions and leaderboards. */
  gameId: string;
  title: string;
  entry: string;
  comingSoon: boolean;
  orientation: 'portrait' | 'landscape' | 'any';
  scoreOrder: 'asc' | 'desc';
  scoreFormat: ScoreFormat;
  cover: React.ReactNode;
};

export function GamePlayer(props: GamePlayerProps) {
  const { slug, gameId, title, entry, comingSoon, orientation, scoreOrder, scoreFormat, cover } =
    props;
  const t = useTranslations();
  const locale = useLocale();
  const gameOrigin = useMemo(() => originOf(entry), [entry]);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  // Resolves once the player has an identity (a guest at least); runs register after that.
  const identityRef = useRef<Promise<unknown>>(Promise.resolve());
  // The run in progress, registered with the server for the leaderboards.
  const runRef = useRef<Run | null>(null);

  const [phase, setPhase] = useState<Phase>('cover');
  const [frameKey, setFrameKey] = useState(0);
  const [slow, setSlow] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [theater, setTheater] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [result, setResult] = useState<{ score: number; improved: boolean } | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // True once the game completed the SDK handshake; exposed for diagnostics and tests.
  const [connected, setConnected] = useState(false);
  const best = useBestScore(slug);

  // Messages always go to the game's registered origin, never '*'.
  const post = useCallback(
    (message: PlatformMessage) => {
      frameRef.current?.contentWindow?.postMessage(message, gameOrigin);
    },
    [gameOrigin],
  );

  const sendStart = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const theme = readThemeState();
    post({
      type: 'GHA_START',
      config: buildStartConfig({
        theme: theme.theme,
        colorMode: theme.mode,
        tokens: gameTokens(theme.theme, theme.mode),
        locale,
        adsEnabled: false,
      }),
    });
  }, [locale, post]);

  // Bridge: only trusted, well-formed messages from this game's frame are handled.
  useEffect(() => {
    if (phase === 'cover') return;
    function onMessage(event: MessageEvent) {
      if (!isTrustedGameMessage(event, frameRef.current?.contentWindow, gameOrigin)) return;
      const message = parseGameMessage(event.data);
      if (!message) return;
      switch (message.type) {
        case 'ready':
          sendStart();
          setConnected(true);
          setPhase('playing');
          break;
        case 'loading':
          setProgress(message.progress);
          break;
        case 'sessionStart':
          runRef.current = beginRun(gameId, identityRef.current);
          setRunResult(null);
          break;
        case 'end': {
          const run = runRef.current;
          runRef.current = null;
          if (message.score !== null) {
            const improved = recordBestScore(slug, message.score, scoreOrder);
            setResult({ score: message.score, improved });
            run?.finish(message.score).then(setRunResult);
          }
          break;
        }
        case 'adRequest':
          // Ads are not live yet (adsEnabled is false); answer so the game never waits.
          post({ type: 'GHA_AD_RESULT', id: message.id, shown: false, rewarded: false });
          break;
        case 'openLeaderboard':
          document.getElementById('leaderboard')?.scrollIntoView({ behavior: 'smooth' });
          break;
        default:
          // Mid-run scores and multiplayer moves are handled once accounts and netcode land.
          break;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [phase, gameOrigin, post, sendStart, slug, gameId, scoreOrder]);

  // Pause the game while the tab is hidden.
  useEffect(() => {
    if (phase !== 'playing') return;
    function onVisibility() {
      post({ type: document.hidden ? 'GHA_PAUSE' : 'GHA_RESUME' });
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, post]);

  // Forward theme switches to the running game.
  useEffect(() => {
    if (phase !== 'playing') return;
    function onTheme(event: Event) {
      const { theme, mode } = (event as CustomEvent<ThemeState>).detail;
      post({ type: 'GHA_THEME_CHANGE', theme, colorMode: mode, tokens: gameTokens(theme, mode) });
    }
    window.addEventListener(THEME_CHANGE_EVENT, onTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onTheme);
  }, [phase, post]);

  // Slow-load hint.
  useEffect(() => {
    if (phase !== 'loading') return;
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [phase, frameKey]);

  // Theater mode widens the page layout through an attribute on <html>.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-theater', theater);
    return () => document.documentElement.removeAttribute('data-theater');
  }, [theater]);

  useEffect(() => {
    function onFullscreen() {
      setFullscreen(document.fullscreenElement === stageRef.current);
    }
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function play() {
    startedRef.current = false;
    setConnected(false);
    setResult(null);
    setRunResult(null);
    runRef.current = null;
    setProgress(null);
    setPhase('loading');
    recordPlay(slug);
    // Every player gets an identity on their first game (a guest unless signed in); never blocks play.
    identityRef.current = ensureGuest(locale as Locale);
    identityRef.current.catch((error) => console.warn('[account] guest sign-in failed', error));
  }

  function reload() {
    startedRef.current = false;
    setConnected(false);
    setProgress(null);
    setPhase('loading');
    setFrameKey((key) => key + 1);
  }

  function onFrameLoad() {
    window.setTimeout(() => {
      setPhase((current) => (current === 'loading' ? 'playing' : current));
    }, NON_SDK_GRACE_MS);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    post({ type: 'GHA_MUTE', muted: next });
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be refused (iOS Safari, embedded views); theater mode still works.
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast(t('player.linkCopied'));
    } catch {
      // The user cancelled the share sheet or clipboard access was refused.
    }
  }

  const showFrame = phase !== 'cover';

  return (
    <div className={styles.player}>
      <div
        ref={stageRef}
        className={styles.stage}
        data-orientation={orientation}
        data-fullscreen={fullscreen}
        data-phase={phase}
        data-bridge={connected ? 'connected' : 'none'}
      >
        {showFrame ? (
          <iframe
            key={frameKey}
            ref={frameRef}
            className={styles.frame}
            src={entry}
            title={t('player.frameTitle', { title })}
            sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
            allow="autoplay; fullscreen; gamepad; accelerometer; gyroscope"
            referrerPolicy="origin"
            onLoad={onFrameLoad}
          />
        ) : null}

        {phase !== 'playing' ? (
          <div className={styles.overlay}>
            {cover}
            <div className={styles.overlayContent}>
              {comingSoon ? (
                <>
                  <strong className={styles.overlayTitle}>{t('game.comingSoonTitle')}</strong>
                  <p>{t('game.comingSoonBody')}</p>
                </>
              ) : phase === 'cover' ? (
                <button type="button" className={styles.playButton} onClick={play}>
                  <PlayIcon size={28} />
                  {t('game.play')}
                </button>
              ) : (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  <p role="status">{t('game.loading', { title })}</p>
                  {progress !== null ? (
                    <progress className={styles.progress} value={progress} max={1} />
                  ) : null}
                  {slow ? (
                    <>
                      <p>{t('game.notResponding')}</p>
                      <button type="button" className={styles.secondaryButton} onClick={reload}>
                        {t('game.retry')}
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.toolbar} role="toolbar" aria-label={t('player.toolbar')}>
        <div className={styles.scoreArea} aria-live="polite">
          {result ? (
            <span>
              {t('game.lastScore', { score: formatScore(result.score, scoreFormat, locale) })}
              {result.improved ? (
                <strong className={styles.best}> · {t('game.personalBest')}</strong>
              ) : null}
            </span>
          ) : best !== null ? (
            <span>{t('game.bestScore', { score: formatScore(best, scoreFormat, locale) })}</span>
          ) : null}
          {runResult ? <RunNote result={runResult} /> : null}
          {toast ? <span className={styles.toast}>{toast}</span> : null}
        </div>
        <FavoriteButton slug={slug} />
        <button
          type="button"
          className={styles.toolButton}
          onClick={share}
          aria-label={t('player.share')}
          title={t('player.share')}
        >
          <ShareIcon />
        </button>
        {showFrame ? (
          <button
            type="button"
            className={styles.toolButton}
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? t('player.unmute') : t('player.mute')}
            title={muted ? t('player.unmute') : t('player.mute')}
          >
            {muted ? <MuteIcon /> : <VolumeIcon />}
          </button>
        ) : null}
        {comingSoon ? null : (
          <>
            <button
              type="button"
              className={styles.toolButton}
              data-desktop-only
              onClick={() => setTheater((v) => !v)}
              aria-pressed={theater}
              aria-label={theater ? t('player.exitTheater') : t('player.theater')}
              title={theater ? t('player.exitTheater') : t('player.theater')}
            >
              <TheaterIcon />
            </button>
            <button
              type="button"
              className={styles.toolButton}
              onClick={toggleFullscreen}
              aria-label={fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
              title={fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
            >
              {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** What happened to the last run on the leaderboard, next to the score. */
function RunNote({ result }: { result: RunResult }) {
  const t = useTranslations('game');
  if (result.status === 'flagged') return <span className={styles.runNote}>{t('runFlagged')}</span>;
  if (result.status === 'rejected') {
    return result.reason === 'too-short' ? (
      <span className={styles.runNote}>{t('runTooShort')}</span>
    ) : null;
  }
  const { rank, previousRank } = result.boards.season;
  return (
    <span className={styles.runNote}>
      {previousRank !== null && previousRank > rank
        ? t('runRankUp', { rank, previous: previousRank })
        : t('runRank', { rank })}
    </span>
  );
}
