'use client';

import {
  DEFAULT_TABLE_SETTINGS,
  isDuelTable,
  type Locale,
  type LobbyPresence,
  type TableSettings,
  type TableVisibility,
} from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureGuest, useAccount } from '@/lib/account/store';
import { firebaseEnabled } from '@/lib/firebase/client';
import type { PlatformMessage } from '@/lib/gha/bridge';
import { parseRoomCode } from '@/lib/netcode/room-code';
import { lobbyPlayers } from '@/lib/lobby/lobby-data';
import { rememberTable, serverNow, syncServerClock, watchLobbyPlayers } from '@/lib/lobby/lobby';
import { invitePlayer, useOutgoingInvites, withdrawInvites } from '@/lib/lobby/outgoing';
import { useLobbyPresence } from '@/lib/lobby/use-presence';
import {
  canStart,
  extendedStart,
  handoverDelay,
  hostSeat,
  nextBotNumber,
  seatOf,
  seatedUids,
  secondsLeft,
  tableReady,
} from '@/lib/netcode/table-data';
import {
  addBot,
  claimHost,
  clearHostLeft,
  clearSeat,
  createTable,
  joinTable,
  leaveTable,
  moveStart,
  openTableChannel,
  setAutoStart,
  setTableSettings,
  setTableVisibility,
  startTable,
  trackTablePresence,
  watchTable,
  type Table,
  type TableChannel,
} from '@/lib/netcode/tables';
import { Link, useRouter } from '@/i18n/navigation';
import { CopyIcon, ExitIcon, ShareIcon, UsersIcon } from '../icons';
import { OnlinePlayers } from '../lobby/online-players';
import lobbyStyles from '../lobby/lobby.module.css';
import { GamePlayer, type GamePlayerProps, type MatchBinding } from './game-player';
import { LeaveTableDialog, type LeaveMode } from './leave-table-dialog';
import { TableSettingsFields, TableSettingsSummary } from './table-settings';
import styles from './game.module.css';

type TableError = 'full' | 'started' | 'missing' | 'closed' | 'expired' | 'failed' | 'unavailable';

type View =
  | { kind: 'loading' }
  | { kind: 'error'; reason: TableError }
  /** "Open a table": the player picks the settings first (docs/adr/0020). */
  | { kind: 'setup' }
  | { kind: 'table' };

/** Shown when another player took over as host. */
type HostNotice = { kind: 'you' } | { kind: 'other'; name: string } | null;

export type TableViewProps = Omit<GamePlayerProps, 'match' | 'comingSoon'> & {
  /** null: open a new table and move to its address. */
  code: string | null;
  gamePath: string;
  /** Number of seats (the game's most players; two: a duel without bots, docs/adr/0026). */
  size: number;
};

// A guest's generated name usually arrives with the profile within a moment.
const NAME_WAIT_MS = 3000;
// A short drop (a phone switching networks) is not a leave yet.
const LEAVE_GRACE_MS = 4000;
// The auto-start countdown on screen.
const TICK_MS = 500;

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
    !firebaseEnabled()
      ? { kind: 'error', reason: 'unavailable' }
      : code === null
        ? { kind: 'setup' }
        : { kind: 'loading' },
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
  // A two-seat table (Tavla): no bots and no hands or turn settings (docs/adr/0026).
  const duel = isDuelTable(size);
  // "Open a table": the settings chosen before the table exists.
  const [draft, setDraft] = useState<TableSettings>(DEFAULT_TABLE_SETTINGS);
  const [draftVisibility, setDraftVisibility] = useState<TableVisibility>('private');
  const [creating, setCreating] = useState(false);
  // Re-renders the auto-start countdown.
  const [, setTick] = useState(0);
  const [hostNotice, setHostNotice] = useState<HostNotice>(null);
  // "Leave table" (slice 5.20): the confirmation, then the write before going to the lobby.
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);
  const leavingRef = useRef(false);
  const leaveButtonRef = useRef<HTMLButtonElement>(null);
  const presenceStopRef = useRef<((remove?: boolean) => void) | null>(null);

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
  const tableRef = useRef<Table | null>(null);
  tableRef.current = table;

  // In the game's lobby list while seated here (docs/adr/0019): "at a table", then "playing".
  useLobbyPresence(
    gameId,
    name,
    view.kind === 'table' && mySeat >= 0 && !leaving ? (playing ? 'playing' : 'table') : null,
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

  // "Open a table" from the game page: private by default (reached through its link and
  // invites), with the settings the player picked.
  async function openNewTable() {
    if (!uid || !name || creating) return;
    setCreating(true);
    try {
      const created = await createTable({
        uid,
        name,
        gameId,
        slug,
        size,
        character: myCharacter,
        visibility: draftVisibility,
        settings: draft,
      });
      rememberTable(gameId, created);
      router.replace(`${gamePath}/table/${created}`);
    } catch {
      setView({ kind: 'error', reason: 'failed' });
    }
  }

  // Take a seat at the table from the link.
  useEffect(() => {
    if (!uid || !name || startedRef.current || view.kind !== 'loading' || code === null) return;
    startedRef.current = true;
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

  // Live table state.
  useEffect(() => {
    if (view.kind !== 'table' || !tableCode || !uid) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    watchTable(tableCode, (next) => {
      if (cancelled) return;
      // This player's own leave closes the table on the way out: no error for them.
      if (next && (next.status !== 'closed' || leavingRef.current)) setTable(next);
      else setView({ kind: 'error', reason: 'closed' });
    }).then((unsubscribe) => (cancelled ? unsubscribe() : (stop = unsubscribe)));
    // The auto-start countdown runs on the database's clock.
    syncServerClock().catch(() => undefined);
    setInviteUrl(`${window.location.origin}${window.location.pathname}`);
    setCanShare(typeof navigator.share === 'function');
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [view.kind, tableCode, uid]);

  // This player's presence at the table, until they leave it.
  useEffect(() => {
    if (view.kind !== 'table' || !tableCode || !uid || leaving) return;
    let cancelled = false;
    let stopped = false;
    let keepEntry = false;
    let stopTracking: ((remove?: boolean) => void) | null = null;
    const stop = (remove = true) => {
      if (stopped) return;
      stopped = true;
      keepEntry = !remove;
      stopTracking?.(remove);
    };
    presenceStopRef.current = stop;
    trackTablePresence(tableCode, uid).then((unsubscribe) => {
      if (cancelled || stopped) unsubscribe(!keepEntry);
      else stopTracking = unsubscribe;
    });
    return () => {
      cancelled = true;
      stop();
      if (presenceStopRef.current === stop) presenceStopRef.current = null;
    };
  }, [view.kind, tableCode, uid, leaving]);

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

  // ---- Auto start (docs/adr/0020) ------------------------------------------------------------
  const counting = view.kind === 'table' && table?.status === 'open' && table.startAt !== null;
  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => window.clearInterval(timer);
  }, [counting]);

  // The players this page has seen sit down. The host gives each new one at least
  // AUTO_START_JOIN_MS of the countdown.
  const knownRef = useRef<Set<string> | null>(null);
  const humansKey = table ? seatedUids(table).join(',') : '';
  useEffect(() => {
    const current = tableRef.current;
    if (view.kind !== 'table' || !current) return;
    const humans = seatedUids(current);
    const known = knownRef.current;
    knownRef.current = new Set([...(known ?? []), ...humans]);
    if (!known || !isHost || current.status !== 'open' || current.startAt === null) return;
    if (!humans.some((player) => !known.has(player))) return;
    const later = extendedStart(current.startAt, serverNow());
    if (later !== null) {
      moveStart(current.code, later).catch((error) =>
        console.warn('[netcode] countdown update failed', error),
      );
    }
  }, [view.kind, humansKey, isHost]);

  // The host's page starts the table when the countdown ends: empty seats get bots (when the
  // table allows them) in the same transaction.
  const seatsShape = table ? table.seats.map((seat) => seat?.kind ?? '-').join('') : '';
  const startAt = table?.status === 'open' ? (table?.startAt ?? null) : null;
  useEffect(() => {
    if (view.kind !== 'table' || !isHost || startAt === null || !tableCode) return;
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        startTable(tableCode, (n) => t('botName', { n }), knownRef.current ?? new Set())
          .then((result) => {
            const current = tableRef.current;
            if (cancelled || result !== 'newPlayer' || !current?.startAt) return;
            // Someone sat down this very moment: give them the countdown first.
            const later = extendedStart(current.startAt, serverNow());
            if (later !== null) return moveStart(tableCode, later);
          })
          .catch((error) => console.warn('[netcode] auto start failed', error));
      },
      Math.max(0, startAt - serverNow()),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // seatsShape: with bots off, a new attempt once more seats are taken.
  }, [view.kind, isHost, startAt, tableCode, seatsShape, t]);

  // ---- Host hand-over (docs/adr/0020) --------------------------------------------------------
  // When the host's table page has been gone for HOST_HANDOVER_MS, the present seated player in
  // the lowest seat takes over (the next ones a little later, in case the first is stuck).
  const delay = table && uid && view.kind === 'table' ? handoverDelay(table, uid) : null;
  const hostUid = table?.hostUid ?? null;
  useEffect(() => {
    if (delay === null || !hostUid || !tableCode || !uid) return;
    const timer = window.setTimeout(() => {
      const current = tableRef.current;
      if (!current || current.hostUid !== hostUid || handoverDelay(current, uid) === null) return;
      claimHost(tableCode, hostUid, uid).catch((error) =>
        console.warn('[netcode] host hand-over failed', error),
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [delay, hostUid, tableCode, uid]);

  // A host who left and came back is waited for again on the next drop (slice 5.20).
  const staleHostLeft =
    isHost && !!table?.hostLeft && !!uid && !!table.online[uid] && !leaving && !!tableCode;
  useEffect(() => {
    if (!staleHostLeft || !tableCode) return;
    clearHostLeft(tableCode).catch((error) =>
      console.warn('[netcode] host marker update failed', error),
    );
  }, [staleHostLeft, tableCode]);

  // Tell the player (and, during a game, the game) when the host changes.
  const shownHostRef = useRef<string | null>(null);
  useEffect(() => {
    const current = tableRef.current;
    if (!hostUid || !current) return;
    const previous = shownHostRef.current;
    shownHostRef.current = hostUid;
    if (previous === null || previous === hostUid) return;
    const seat = hostSeat(current);
    const host = current.seats[seat];
    setHostNotice(
      hostUid === uid
        ? { kind: 'you' }
        : { kind: 'other', name: host?.kind === 'player' ? host.name : '' },
    );
  }, [hostUid, uid]);

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
        // A host who pressed "Leave table" is gone for sure, and a new host follows at once:
        // the game hears about the leave first (slice 5.20).
        const onPurpose = seat.uid === table.hostUid && table.hostLeft;
        timersRef.current[index] = window.setTimeout(
          () => {
            awayRef.current.add(index);
            deliver({ type: 'GHA_PEER_LEAVE', seat: index });
            setAway([...awayRef.current]);
          },
          onPurpose ? 0 : LEAVE_GRACE_MS,
        );
      }
    });
    setAway([...awayRef.current]);
  }, [playing, table, mySeat, deliver]);
  useEffect(() => {
    const timers = timersRef.current;
    return () => Object.values(timers).forEach((timer) => window.clearTimeout(timer));
  }, []);

  // The seats as they were when the game started go into GHA_START (protocol 2.3), with the
  // settings and the host's seat (protocol 2.7). A later hand-over goes to the game as
  // GHA_HOST_CHANGE, so the binding (and the running game) stays the same.
  const seatsKey = playing && table ? JSON.stringify(table.seats) : '';
  const startHostRef = useRef(-1);
  const match = useMemo<MatchBinding | null>(() => {
    const current = tableRef.current;
    if (!seatsKey || !current) return null;
    const seats = current.seats.map((seat) =>
      seat?.kind === 'player'
        ? { name: seat.name, character: seat.character, bot: false }
        : { name: seat?.name ?? '', bot: true },
    );
    const me = current.seats[mySeat];
    const host = Math.max(0, hostSeat(current));
    startHostRef.current = host;
    return {
      seat: {
        isHost: host === mySeat,
        peerName: '',
        table: { index: mySeat, seats, settings: current.settings, hostSeat: host },
      },
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
  }, [seatsKey, mySeat]);

  // Protocol 2.7: the game hears about a new host while it runs.
  const hostSeatNow = playing && table ? hostSeat(table) : -1;
  useEffect(() => {
    if (!match || hostSeatNow < 0 || hostSeatNow === startHostRef.current) return;
    startHostRef.current = hostSeatNow;
    deliver({ type: 'GHA_HOST_CHANGE', hostSeat: hostSeatNow });
  }, [match, hostSeatNow, deliver]);

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

  // ---- Leave table (slice 5.20) --------------------------------------------------------------
  function closeLeaveDialog() {
    setConfirmLeave(false);
    setLeaveFailed(false);
    leaveButtonRef.current?.focus();
  }

  async function leave() {
    if (!table || !uid || leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    setLeaveFailed(false);
    // No presence write may follow the leave (a reconnect would bring it back). The leave
    // removes the entry itself, in the same write as the seat or the host marker, so the others
    // see both at once.
    presenceStopRef.current?.(false);
    try {
      const kind = await leaveTable(table.code, uid);
      if (kind !== 'away') {
        // The seat is free or the table closed: invites to it are taken back, and the lobby no
        // longer points here. During a game the seat stays theirs, and so does the way back.
        withdrawInvites(uid, table.code);
        rememberTable(gameId, null);
      }
      router.replace(`${gamePath}/lobby`);
    } catch (error) {
      console.warn('[netcode] leaving the table failed', error);
      leavingRef.current = false;
      setLeaving(false);
      setLeaveFailed(true);
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

  const hostIndex = table ? hostSeat(table) : -1;
  const hostName = (hostIndex >= 0 ? table?.seats[hostIndex]?.name : null) ?? '';
  const autoStart = table?.status === 'open' && table.startAt !== null;
  const left = autoStart && table?.startAt != null ? secondsLeft(table.startAt, serverNow()) : null;
  const ready = table ? tableReady(table) : false;
  const awayNames = away.map((index) => table?.seats[index]?.name).filter(Boolean);
  const seatedHere = view.kind === 'table' && !!table && mySeat >= 0;
  const leaveMode: LeaveMode = playing
    ? duel
      ? 'gameDuel'
      : 'game'
    : isHost
      ? table && seatedUids(table).length > 1
        ? 'host'
        : 'close'
      : 'seat';
  // Between the leave write and the lobby: the seat is gone, so nothing of the table is shown.
  const departed = leaving && (mySeat < 0 || table?.status === 'closed');

  return (
    <div
      className={styles.room}
      data-room-state={playing ? 'playing' : view.kind}
      data-host={isHost || undefined}
    >
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
          {seatedHere || leaving ? (
            <button
              ref={leaveButtonRef}
              type="button"
              className={styles.leaveButton}
              aria-haspopup="dialog"
              disabled={leaving}
              onClick={() => setConfirmLeave(true)}
              data-leave
            >
              <ExitIcon /> {t('leave.button')}
            </button>
          ) : null}
        </p>
      </header>

      <LeaveTableDialog
        open={confirmLeave && (seatedHere || leaving)}
        mode={leaveMode}
        busy={leaving}
        failed={leaveFailed}
        onLeave={leave}
        onStay={closeLeaveDialog}
      />

      {departed ? (
        <section className={styles.card} aria-busy="true">
          <span className={styles.spinner} aria-hidden="true" />
          <p role="status">{t('leave.leaving')}</p>
        </section>
      ) : null}

      {hostNotice && view.kind === 'table' ? (
        <p className={styles.hostNotice} role="status" data-host-notice={hostNotice.kind}>
          {hostNotice.kind === 'you'
            ? duel
              ? t('duel.youAreHost')
              : t('youAreHost')
            : t('hostChanged', { name: hostNotice.name })}
        </p>
      ) : null}

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

      {view.kind === 'setup' ? (
        <section className={styles.card} aria-labelledby="table-setup-heading">
          <h2 id="table-setup-heading">{t('setupTitle')}</h2>
          <p>{t('setupBody')}</p>
          <TableSettingsFields
            id="new-table"
            settings={draft}
            onChange={setDraft}
            visibility={draftVisibility}
            onVisibility={setDraftVisibility}
            disabled={creating}
            duel={duel}
          />
          <button
            type="button"
            className={styles.friendButton}
            disabled={!uid || !name || creating}
            onClick={openNewTable}
          >
            {creating ? tLobby('opening') : t('createTable')}
          </button>
        </section>
      ) : null}

      {view.kind === 'table' && table && !playing && !departed ? (
        <section className={styles.card} aria-labelledby="table-heading">
          {autoStart && left !== null ? (
            <div className={styles.countdown} data-countdown={left}>
              <p role="timer" className={styles.countdownText}>
                {left > 0
                  ? t('countdown', { seconds: left })
                  : ready || table.settings.bots
                    ? t('starting')
                    : t('waitingPlayers')}
              </p>
              <span
                className={styles.countdownBar}
                aria-hidden="true"
                style={{ '--countdown': Math.min(1, left / 20) } as React.CSSProperties}
              />
              <p>
                {duel
                  ? t('duel.countdown')
                  : table.settings.bots
                    ? t('countdownBots')
                    : t('countdownNoBots')}
              </p>
            </div>
          ) : null}

          <h2 id="table-heading">{t('inviteTitle')}</h2>
          <p>{duel ? t('duel.inviteBody') : t('inviteBody')}</p>
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
                    {index === hostIndex ? (
                      <span className={styles.seatTag}>{t('host')}</span>
                    ) : null}
                    {seat?.kind === 'bot' ? (
                      <span className={styles.seatTag}>{t('bot')}</span>
                    ) : null}
                    {seat?.kind === 'player' && !online ? (
                      <span className={styles.seatTag}>{t('away')}</span>
                    ) : null}
                  </span>
                  {isHost && index !== hostIndex ? (
                    seat === null ? (
                      table.settings.bots ? (
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
                      ) : null
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
                disabled={busy || !canStart(table)}
                onClick={() =>
                  hostAction(async () => {
                    await startTable(table.code, (n) => t('botName', { n }));
                  })
                }
                data-start
              >
                {ready || duel ? t('start') : t('startWithBots')}
              </button>
              {!ready ? (
                <p>
                  {duel
                    ? t('duel.startHint')
                    : table.settings.bots
                      ? t('startHintBots')
                      : t('startHintNoBots')}
                </p>
              ) : null}
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
              {table.visibility === 'public' ? (
                <>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={autoStart}
                      disabled={busy}
                      aria-describedby="table-autostart-hint"
                      onChange={(event) =>
                        hostAction(() => setAutoStart(table.code, event.target.checked))
                      }
                      data-auto-start
                    />
                    <span>{t('autoStartLabel')}</span>
                  </label>
                  <p id="table-autostart-hint">{t('autoStartHint')}</p>
                </>
              ) : null}
            </>
          ) : !autoStart ? (
            <p className={styles.waiting} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              {t('waitingHost', { name: hostName })}
            </p>
          ) : null}
        </section>
      ) : null}

      {view.kind === 'table' && table && !playing && !departed && !duel ? (
        <section className={styles.card} aria-labelledby="table-settings-heading">
          <h2 id="table-settings-heading">{t('settings.title')}</h2>
          {isHost ? (
            <>
              <p>{t('settingsHostHint')}</p>
              <TableSettingsFields
                id="table"
                settings={table.settings}
                disabled={busy}
                onChange={(next) => hostAction(() => setTableSettings(table, next))}
              />
            </>
          ) : (
            <TableSettingsSummary settings={table.settings} autoStart={autoStart} />
          )}
        </section>
      ) : null}

      {view.kind === 'table' && table && !playing && !departed && waitingHere ? (
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

      {playing && match && table ? (
        <>
          <div className={styles.matchStatus} aria-live="polite">
            <strong>
              {t('players', {
                names: table.seats.map((seat) => seat?.name ?? '').join(' · '),
              })}
            </strong>
            <TableSettingsSummary settings={table.settings} duel={duel} />
            {awayNames.length ? (
              <span>{t(duel ? 'duel.peerAway' : 'peerAway', { name: awayNames.join(', ') })}</span>
            ) : null}
          </div>
          <GamePlayer {...props} comingSoon={false} match={match} />
        </>
      ) : null}
    </div>
  );
}
