'use client';

import type { Locale } from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureGuest, useAccount } from '@/lib/account/store';
import { firebaseEnabled } from '@/lib/firebase/client';
import type { PlatformMessage } from '@/lib/gha/bridge';
import { loadIceServers, openPeerLink, type LinkRoute, type PeerLink } from '@/lib/netcode/link';
import { parseRoomCode } from '@/lib/netcode/room-code';
import { createRoom, joinRoom, trackPresence, watchRoom, type Room } from '@/lib/netcode/rooms';
import { Link, useRouter } from '@/i18n/navigation';
import { CopyIcon, ShareIcon, UsersIcon } from '../icons';
import { GamePlayer, type GamePlayerProps, type MatchBinding } from './game-player';
import styles from './game.module.css';

type RoomError = 'full' | 'missing' | 'closed' | 'expired' | 'failed' | 'unavailable';

type View =
  { kind: 'loading' } | { kind: 'error'; reason: RoomError } | { kind: 'room'; isHost: boolean };

export type RoomViewProps = Omit<GamePlayerProps, 'match' | 'comingSoon'> & {
  /** null: create a new room and move to its address. */
  code: string | null;
  gamePath: string;
};

// A guest's generated name usually arrives with the profile within a moment.
const NAME_WAIT_MS = 3000;
// A short drop (a phone switching networks) is not a leave yet.
const LEAVE_GRACE_MS = 4000;

/** The online room: create or join, invite link, then the game for both players. */
export function RoomView(props: RoomViewProps) {
  const { code, gamePath, slug, gameId, title } = props;
  const t = useTranslations('online');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const account = useAccount();

  const [view, setView] = useState<View>(() =>
    firebaseEnabled() ? { kind: 'loading' } : { kind: 'error', reason: 'unavailable' },
  );
  const [room, setRoom] = useState<Room | null>(null);
  const [route, setRoute] = useState<LinkRoute>('connecting');
  const [nameTimedOut, setNameTimedOut] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [gameOn, setGameOn] = useState(false);
  const [peerAway, setPeerAway] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const startedRef = useRef(false);
  const linkRef = useRef<PeerLink | null>(null);
  const posterRef = useRef<((message: PlatformMessage) => void) | null>(null);
  const queueRef = useRef<PlatformMessage[]>([]);

  const uid = account.status === 'signedIn' ? account.uid : null;
  const profileName = account.status === 'signedIn' ? (account.profile?.username ?? null) : null;
  const name = profileName ?? (nameTimedOut ? t('defaultName') : null);
  const roomCode = code === null ? null : parseRoomCode(code);
  const isHost = view.kind === 'room' && view.isHost;
  const peerUid = room ? (isHost ? room.guestUid : room.hostUid) : null;
  const peerName = room ? ((isHost ? room.guestName : room.hostName) ?? '') : '';
  const peerOnline = !!(peerUid && room?.online[peerUid]);

  // Messages for the game wait until it has its seat (GHA_START).
  const deliver = useCallback((message: PlatformMessage) => {
    if (posterRef.current) posterRef.current(message);
    else queueRef.current.push(message);
  }, []);

  // Every player needs an identity; a guest account is made on the spot.
  useEffect(() => {
    if (view.kind === 'error') return;
    ensureGuest(locale).catch(() => setView({ kind: 'error', reason: 'failed' }));
    const timer = window.setTimeout(() => setNameTimedOut(true), NAME_WAIT_MS);
    return () => window.clearTimeout(timer);
    // Runs once per page; the locale does not change while a room is open.
  }, []);

  // Create the room, or take a seat in the one from the link.
  useEffect(() => {
    if (!uid || !name || startedRef.current || view.kind !== 'loading') return;
    startedRef.current = true;
    if (code === null) {
      createRoom({ uid, name, gameId, slug })
        .then((created) => router.replace(`${gamePath}/room/${created}`))
        .catch(() => setView({ kind: 'error', reason: 'failed' }));
      return;
    }
    if (!roomCode) {
      setView({ kind: 'error', reason: 'missing' });
      return;
    }
    joinRoom(roomCode, uid, name)
      .then((result) => {
        if (result.kind === 'host' || result.kind === 'guest') {
          if (result.room.slug !== slug) {
            router.replace(`/games/${result.room.slug}/room/${roomCode}`);
            return;
          }
          setRoom(result.room);
          setView({ kind: 'room', isHost: result.kind === 'host' });
        } else setView({ kind: 'error', reason: result.kind });
      })
      .catch(() => setView({ kind: 'error', reason: 'failed' }));
  }, [uid, name, view.kind, code, roomCode, gameId, slug, gamePath, router]);

  // Live room state and this player's presence.
  useEffect(() => {
    if (view.kind !== 'room' || !roomCode || !uid) return;
    let cancelled = false;
    const stops: Array<() => void> = [];
    watchRoom(roomCode, (next) => {
      if (cancelled) return;
      if (next) setRoom(next);
      else setView({ kind: 'error', reason: 'closed' });
    }).then((stop) => (cancelled ? stop() : stops.push(stop)));
    trackPresence(roomCode, uid).then((stop) => (cancelled ? stop() : stops.push(stop)));
    setInviteUrl(`${window.location.origin}${window.location.pathname}`);
    setCanShare(typeof navigator.share === 'function');
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [view.kind, roomCode, uid]);

  // The connection to the other player, once both seats are taken.
  useEffect(() => {
    if (view.kind !== 'room' || !roomCode || !uid || !peerUid) return;
    let cancelled = false;
    const forceTurn = new URLSearchParams(window.location.search).get('turn') === '1';
    loadIceServers()
      .then((iceServers) =>
        openPeerLink({
          code: roomCode,
          me: uid,
          peer: peerUid,
          isHost,
          iceServers,
          forceTurn,
          onMessage(json) {
            try {
              deliver({ type: 'GHA_MOVE_IN', data: JSON.parse(json) as unknown });
            } catch {
              // Not JSON: ignore.
            }
          },
          onRoute: setRoute,
        }),
      )
      .then((link) => {
        if (cancelled) link.close();
        else linkRef.current = link;
      })
      .catch((error) => console.warn('[netcode] link failed', error));
    return () => {
      cancelled = true;
      linkRef.current?.close();
      linkRef.current = null;
    };
  }, [view.kind, roomCode, uid, peerUid, isHost, deliver]);

  // The game appears once the other player is here, and then stays.
  useEffect(() => {
    if (peerOnline && peerName) setGameOn(true);
  }, [peerOnline, peerName]);

  // Tell the game when the other player leaves (after a grace period) and comes back.
  const awayRef = useRef(false);
  useEffect(() => {
    if (!gameOn) return;
    if (peerOnline) {
      if (awayRef.current) deliver({ type: 'GHA_PEER_JOIN', name: peerName });
      awayRef.current = false;
      setPeerAway(false);
      return;
    }
    const timer = window.setTimeout(() => {
      awayRef.current = true;
      setPeerAway(true);
      deliver({ type: 'GHA_PEER_LEAVE' });
    }, LEAVE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [gameOn, peerOnline, peerName, deliver]);

  const seatName = gameOn ? peerName : '';
  const match = useMemo<MatchBinding>(
    () => ({
      seat: { isHost, peerName: seatName },
      send: (json) => linkRef.current?.send(json),
      attach(post) {
        posterRef.current = post;
        queueRef.current.splice(0).forEach(post);
        return () => {
          if (posterRef.current === post) posterRef.current = null;
        };
      },
    }),
    [isHost, seatName],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      // Clipboard access refused; the link is still selectable in the field.
    }
  }

  async function shareInvite() {
    try {
      await navigator.share({ title, text: t('shareText', { title }), url: inviteUrl });
    } catch {
      // The share sheet was cancelled.
    }
  }

  return (
    <div className={styles.room} data-room-state={gameOn ? 'playing' : view.kind}>
      <header className={styles.titleRow}>
        <h1>
          <UsersIcon /> {t('title', { title })}
        </h1>
        <p className={styles.meta}>
          {roomCode && view.kind === 'room' ? (
            <span>{t('roomCode', { code: roomCode })}</span>
          ) : null}
          <Link href={gamePath}>{t('backToGame', { title })}</Link>
        </p>
      </header>

      {view.kind === 'loading' ? (
        <section className={styles.card} aria-busy="true">
          <span className={styles.spinner} aria-hidden="true" />
          <p role="status">{t('preparing')}</p>
        </section>
      ) : null}

      {view.kind === 'error' ? (
        <section className={styles.card} role="alert">
          <p>{t(`error.${view.reason}`)}</p>
          <p className={styles.meta}>
            {view.reason !== 'unavailable' ? (
              <Link href={`${gamePath}/room`}>{t('newRoom')}</Link>
            ) : null}
            <Link href={gamePath}>{t('backToGame', { title })}</Link>
          </p>
        </section>
      ) : null}

      {view.kind === 'room' && !gameOn ? (
        <section className={styles.card} aria-labelledby="invite-heading">
          {isHost ? (
            <>
              <h2 id="invite-heading">{t('inviteTitle')}</h2>
              <p>{t('inviteBody')}</p>
              <div className={styles.inviteRow}>
                <input
                  className={styles.inviteInput}
                  readOnly
                  value={inviteUrl}
                  aria-label={t('inviteLabel')}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" className={styles.inviteButton} onClick={copyInvite}>
                  <CopyIcon /> {copied ? t('copied') : t('copy')}
                </button>
                {canShare ? (
                  <button type="button" className={styles.inviteButton} onClick={shareInvite}>
                    <ShareIcon /> {t('share')}
                  </button>
                ) : null}
              </div>
              <p className={styles.waiting} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                {room?.guestUid && room.guestName
                  ? t('waitingFor', { name: room.guestName })
                  : t('waitingFriend')}
              </p>
            </>
          ) : (
            <p className={styles.waiting} role="status" id="invite-heading">
              <span className={styles.spinner} aria-hidden="true" />
              {t('waitingFor', { name: peerName })}
            </p>
          )}
        </section>
      ) : null}

      {gameOn ? (
        <>
          <p className={styles.matchStatus} aria-live="polite">
            <strong>{t('opponent', { name: peerName })}</strong>
            <span className={styles.routeBadge} data-route={route}>
              {t(`route.${route}`)}
            </span>
            {peerAway ? <span>{t('peerAway', { name: peerName })}</span> : null}
          </p>
          <GamePlayer {...props} comingSoon={false} match={match} />
        </>
      ) : null}
    </div>
  );
}
