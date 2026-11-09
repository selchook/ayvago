'use client';

import type { Locale, LobbyPresence } from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureGuest, useAccount } from '@/lib/account/store';
import { firebaseEnabled } from '@/lib/firebase/client';
import type { PlatformMessage } from '@/lib/gha/bridge';
import { parseRoomCode } from '@/lib/netcode/room-code';
import { lobbyPlayers } from '@/lib/lobby/lobby-data';
import { rememberTable, watchLobbyPlayers } from '@/lib/lobby/lobby';
import { invitePlayer, useOutgoingInvites } from '@/lib/lobby/outgoing';
import { useLobbyPresence } from '@/lib/lobby/use-presence';
import { nextBotNumber, seatOf, seatedUids, tableReady } from '@/lib/netcode/table-data';
import {
  addBot,
  clearSeat,
  createTable,
  joinTable,
  openTableChannel,
  setTableVisibility,
  startTable,
  trackTablePresence,
  watchTable,
  type Table,
  type TableChannel,
} from '@/lib/netcode/tables';
import { Link, useRouter } from '@/i18n/navigation';
import { CopyIcon, ShareIcon, UsersIcon } from '../icons';
import { OnlinePlayers } from '../lobby/online-players';
import lobbyStyles from '../lobby/lobby.module.css';
import { GamePlayer, type GamePlayerProps, type MatchBinding } from './game-player';
import styles from './game.module.css';

type TableError = 'full' | 'started' | 'missing' | 'closed' | 'expired' | 'failed' | 'unavailable';

type View = { kind: 'loading' } | { kind: 'error'; reason: TableError } | { kind: 'table' };

export type TableViewProps = Omit<GamePlayerProps, 'match' | 'comingSoon'> & {
  /** null: open a new table and move to its address. */
  code: string | null;
  gamePath: string;
  /** Number of seats (the game's most players). */
  size: number;
};

// A guest's generated name usually arrives with the profile within a moment.
const NAME_WAIT_MS = 3000;
// A short drop (a phone switching networks) is not a leave yet.
const LEAVE_GRACE_MS = 4000;

/**
 * A game table for up to four (docs/adr/0015-tables-for-four-with-bots.md): open or join, invite
 * link, seats that the host fills with bots, then the game for everyone once the host starts it.
 */
export function TableView(props: TableViewProps) {
  const { code, gamePath, slug, gameId, title, size } = props;
  const t = useTranslations('table');
  const tOnline = useTranslations('online');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const account = useAccount();

  const [view, setView] = useState<View>(() =>
    firebaseEnabled() ? { kind: 'loading' } : { kind: 'error', reason: 'unavailable' },
  );
  const [table, setTable] = useState<Table | null>(null);
  const [nameTimedOut, setNameTimedOut] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [away, setAway] = useState<number[]>([]);
  const [lobby, setLobby] = useState<LobbyPresence[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<'inviteLimit' | 'inviteFailed' | null>(null);
  const outgoing = useOutgoingInvites();
  const tLobby = useTranslations('lobby');

  const startedRef = useRef(false);
  const channelRef = useRef<TableChannel | null>(null);
  const posterRef = useRef<((message: PlatformMessage) => void) | null>(null);
  const queueRef = useRef<PlatformMessage[]>([]);

  const uid = account.status === 'signedIn' ? account.uid : null;
  const profileName = account.status === 'signedIn' ? (account.profile?.username ?? null) : null;
  const name = profileName ?? (nameTimedOut ? tOnline('defaultName') : null);
  const myCharacter = account.status === 'signedIn' ? (account.profile?.characterId ?? null) : null;
  const tableCode = code === null ? null : parseRoomCode(code);
  const isHost = !!table && !!uid && table.hostUid === uid;
  const mySeat = table && uid ? seatOf(table, uid) : -1;
  const playing = table?.status === 'playing' && mySeat >= 0;

  // In the game's lobby list while seated here (docs/adr/0019): "at a table", then "playing".
  useLobbyPresence(
    gameId,
    name,
    view.kind === 'table' && mySeat >= 0 ? (playing ? 'playing' : 'table') : null,
  );

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
    // Runs once per page; the locale does not change while a table is open.
  }, []);

  // Open the table, or take a seat at the one from the link.
  useEffect(() => {
    if (!uid || !name || startedRef.current || view.kind !== 'loading') return;
    startedRef.current = true;
    if (code === null) {
      // A table from "Open a private table" is reached only through its link and invites.
      createTable({ uid, name, gameId, slug, size, character: myCharacter, visibility: 'private' })
        .then((created) => router.replace(`${gamePath}/table/${created}`))
        .catch(() => setView({ kind: 'error', reason: 'failed' }));
      return;
    }
    if (!tableCode) {
      setView({ kind: 'error', reason: 'missing' });
      return;
    }
    joinTable(tableCode, uid, name, myCharacter)
      .then((result) => {
        if (result.kind !== 'seated') {
          setView({ kind: 'error', reason: result.kind });
          return;
        }
        if (result.table.slug !== slug) {
          router.replace(`/games/${result.table.slug}/table/${tableCode}`);
          return;
        }
        setTable(result.table);
        setView({ kind: 'table' });
        // The lobby points back here (docs/adr/0019).
        rememberTable(gameId, tableCode);
      })
      .catch(() => setView({ kind: 'error', reason: 'failed' }));
  }, [uid, name, myCharacter, view.kind, code, tableCode, gameId, slug, size, gamePath, router]);

  // Live table state and this player's presence.
  useEffect(() => {
    if (view.kind !== 'table' || !tableCode || !uid) return;
    let cancelled = false;
    const stops: Array<() => void> = [];
    watchTable(tableCode, (next) => {
      if (cancelled) return;
      if (next) setTable(next);
      else setView({ kind: 'error', reason: 'closed' });
    }).then((stop) => (cancelled ? stop() : stops.push(stop)));
    trackTablePresence(tableCode, uid).then((stop) => (cancelled ? stop() : stops.push(stop)));
    setInviteUrl(`${window.location.origin}${window.location.pathname}`);
    setCanShare(typeof navigator.share === 'function');
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [view.kind, tableCode, uid]);

  // Players online in this game's lobby, to invite while the table waits for players.
  const waitingHere = view.kind === 'table' && !!table && table.status === 'open' && mySeat >= 0;
  useEffect(() => {
    if (!waitingHere) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    watchLobbyPlayers(gameId, (players) => !cancelled && setLobby(players))
      .then((unsubscribe) => (cancelled ? unsubscribe() : (stop = unsubscribe)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [waitingHere, gameId]);

  async function invite(player: LobbyPresence) {
    if (!uid || !name || !table) return;
    setInviting(player.uid);
    setInviteNotice(null);
    const status = await invitePlayer({
      from: uid,
      fromName: name,
      fromCharacter: myCharacter,
      to: player.uid,
      gameId,
      slug,
      tableCode: table.code,
    });
    if (status === 'limit') setInviteNotice('inviteLimit');
    else if (status === 'failed') setInviteNotice('inviteFailed');
    setInviting(null);
  }

  // The move channel, once the game is on.
  useEffect(() => {
    if (!playing || !tableCode || !uid) return;
    let cancelled = false;
    openTableChannel({
      code: tableCode,
      uid,
      seat: mySeat,
      onMove(from, json) {
        try {
          deliver({ type: 'GHA_MOVE_IN', data: JSON.parse(json) as unknown, from });
        } catch {
          // Not JSON: ignore.
        }
      },
    })
      .then((channel) => {
        if (cancelled) channel.close();
        else channelRef.current = channel;
      })
      .catch((error) => console.warn('[netcode] table channel failed', error));
    return () => {
      cancelled = true;
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [playing, tableCode, uid, mySeat, deliver]);

  // Tell the game when another player leaves (after a grace period) or comes back. A new page
  // session means a reload: their game restarted, so it counts as leaving and joining again.
  const sessionsRef = useRef<Record<number, string | null>>({});
  const awayRef = useRef<Set<number>>(new Set());
  const timersRef = useRef<Record<number, number>>({});
  useEffect(() => {
    if (!playing || !table) return;
    table.seats.forEach((seat, index) => {
      if (index === mySeat || seat?.kind !== 'player') return;
      const session = table.online[seat.uid] ?? null;
      const previous = sessionsRef.current[index] ?? null;
      sessionsRef.current[index] = session;
      if (session) {
        window.clearTimeout(timersRef.current[index]);
        if (awayRef.current.has(index)) {
          awayRef.current.delete(index);
          deliver({ type: 'GHA_PEER_JOIN', name: seat.name, seat: index });
        } else if (previous && previous !== session) {
          deliver({ type: 'GHA_PEER_LEAVE', seat: index });
          deliver({ type: 'GHA_PEER_JOIN', name: seat.name, seat: index });
        }
      } else if (previous !== null || !(index in timersRef.current)) {
        window.clearTimeout(timersRef.current[index]);
        timersRef.current[index] = window.setTimeout(() => {
          awayRef.current.add(index);
          deliver({ type: 'GHA_PEER_LEAVE', seat: index });
          setAway([...awayRef.current]);
        }, LEAVE_GRACE_MS);
      }
    });
    setAway([...awayRef.current]);
  }, [playing, table, mySeat, deliver]);
  useEffect(() => {
    const timers = timersRef.current;
    return () => Object.values(timers).forEach((timer) => window.clearTimeout(timer));
  }, []);

  // The seats as they were when the game started go into GHA_START (protocol 2.3).
  const seatsKey = playing && table ? JSON.stringify(table.seats) : '';
  const match = useMemo<MatchBinding | null>(() => {
    if (!seatsKey || !table) return null;
    const seats = table.seats.map((seat) =>
      seat?.kind === 'player'
        ? { name: seat.name, character: seat.character, bot: false }
        : { name: seat?.name ?? '', bot: true },
    );
    const me = table.seats[mySeat];
    return {
      seat: { isHost, peerName: '', table: { index: mySeat, seats } },
      character: me?.kind === 'player' ? me.character : null,
      send: (json) => channelRef.current?.send(json),
      attach(post) {
        posterRef.current = post;
        queueRef.current.splice(0).forEach(post);
        return () => {
          if (posterRef.current === post) posterRef.current = null;
        };
      },
    };
    // The binding changes only when the seats do.
  }, [seatsKey, mySeat, isHost]);

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
      await navigator.share({ title, text: tOnline('shareText', { title }), url: inviteUrl });
    } catch {
      // The share sheet was cancelled.
    }
  }

  async function hostAction(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.warn('[netcode] table update failed', error);
    } finally {
      setBusy(false);
    }
  }

  const hostName = table?.seats[0]?.name ?? '';
  const awayNames = away.map((index) => table?.seats[index]?.name).filter(Boolean);

  return (
    <div className={styles.room} data-room-state={playing ? 'playing' : view.kind}>
      <header className={styles.titleRow}>
        <h1>
          <UsersIcon /> {t('title', { title })}
        </h1>
        <p className={styles.meta}>
          {tableCode && view.kind === 'table' ? (
            <span>{t('tableCode', { code: tableCode })}</span>
          ) : null}
          <Link href={`${gamePath}/lobby`}>{t('lobbyLink')}</Link>
          <Link href={gamePath}>{tOnline('backToGame', { title })}</Link>
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
              <Link href={`${gamePath}/table`}>{t('newTable')}</Link>
            ) : null}
            <Link href={gamePath}>{tOnline('backToGame', { title })}</Link>
          </p>
        </section>
      ) : null}

      {view.kind === 'table' && table && !playing ? (
        <section className={styles.card} aria-labelledby="table-heading">
          <h2 id="table-heading">{t('inviteTitle')}</h2>
          <p>{t('inviteBody')}</p>
          <div className={styles.inviteRow}>
            <input
              className={styles.inviteInput}
              readOnly
              value={inviteUrl}
              aria-label={tOnline('inviteLabel')}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" className={styles.inviteButton} onClick={copyInvite}>
              <CopyIcon /> {copied ? tOnline('copied') : tOnline('copy')}
            </button>
            {canShare ? (
              <button type="button" className={styles.inviteButton} onClick={shareInvite}>
                <ShareIcon /> {tOnline('share')}
              </button>
            ) : null}
          </div>

          <ol className={styles.seats} aria-label={t('seats')}>
            {table.seats.map((seat, index) => {
              const online = seat?.kind === 'player' && !!table.online[seat.uid];
              return (
                <li
                  key={index}
                  className={styles.seat}
                  data-kind={seat ? seat.kind : 'empty'}
                  data-me={index === mySeat || undefined}
                >
                  <span className={styles.seatNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className={styles.seatName}>
                    {seat ? seat.name : t('empty')}
                    {index === mySeat ? <small> ({t('you')})</small> : null}
                  </span>
                  <span className={styles.seatTags}>
                    {index === 0 ? <span className={styles.seatTag}>{t('host')}</span> : null}
                    {seat?.kind === 'bot' ? (
                      <span className={styles.seatTag}>{t('bot')}</span>
                    ) : null}
                    {seat?.kind === 'player' && !online ? (
                      <span className={styles.seatTag}>{t('away')}</span>
                    ) : null}
                  </span>
                  {isHost && index !== 0 ? (
                    seat === null ? (
                      <button
                        type="button"
                        className={styles.seatAction}
                        disabled={busy}
                        onClick={() =>
                          hostAction(() =>
                            addBot(table.code, index, t('botName', { n: nextBotNumber(table) })),
                          )
                        }
                      >
                        {t('addBot')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.seatAction}
                        data-tone="quiet"
                        disabled={busy}
                        onClick={() => hostAction(() => clearSeat(table.code, index))}
                      >
                        {seat.kind === 'bot' ? t('removeBot') : t('removePlayer')}
                      </button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ol>

          {isHost ? (
            <>
              <button
                type="button"
                className={styles.friendButton}
                disabled={busy || !tableReady(table)}
                onClick={() => hostAction(() => startTable(table.code))}
              >
                {t('start')}
              </button>
              {!tableReady(table) ? <p>{t('startHint')}</p> : null}
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={table.visibility === 'public'}
                  disabled={busy}
                  aria-describedby="table-visibility-hint"
                  onChange={(event) =>
                    hostAction(() =>
                      setTableVisibility(table.code, event.target.checked ? 'public' : 'private'),
                    )
                  }
                />
                <span>{t('visibilityLabel')}</span>
              </label>
              <p id="table-visibility-hint">{t('visibilityHint')}</p>
            </>
          ) : (
            <p className={styles.waiting} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              {t('waitingHost', { name: hostName })}
            </p>
          )}
        </section>
      ) : null}

      {view.kind === 'table' && table && !playing && waitingHere ? (
        <section className={styles.card} aria-labelledby="table-online-heading">
          <h2 id="table-online-heading">{t('inviteOnlineTitle')}</h2>
          {inviteNotice ? (
            <p className={lobbyStyles.notice} role="alert">
              {tLobby(inviteNotice)}
            </p>
          ) : null}
          {lobby.some((player) => player.uid !== uid) ? (
            <div className={styles.fullWidth}>
              <OnlinePlayers
                players={lobbyPlayers(lobby, uid)}
                me={uid}
                seated={seatedUids(table)}
                canInvite={!!name}
                outgoing={outgoing}
                busy={inviting}
                onInvite={invite}
                hideMe
              />
            </div>
          ) : (
            <p>{t('inviteOnlineEmpty')}</p>
          )}
        </section>
      ) : null}

      {playing && match ? (
        <>
          <p className={styles.matchStatus} aria-live="polite">
            <strong>
              {t('players', {
                names: (table?.seats ?? []).map((seat) => seat?.name ?? '').join(' · '),
              })}
            </strong>
            {awayNames.length ? <span>{t('peerAway', { name: awayNames.join(', ') })}</span> : null}
          </p>
          <GamePlayer {...props} comingSoon={false} match={match} />
        </>
      ) : null}
    </div>
  );
}
