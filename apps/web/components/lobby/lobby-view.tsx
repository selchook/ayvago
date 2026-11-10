'use client';

import {
  DEFAULT_TABLE_SETTINGS,
  LOBBY_TABLE_TTL_MS,
  type Locale,
  type LobbyPresence,
  type LobbyTable,
  type TableSettings,
  type TableVisibility,
} from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { ensureGuest, useAccount } from '@/lib/account/store';
import { firebaseEnabled } from '@/lib/firebase/client';
import {
  botCount,
  canSit,
  freeSeatCount,
  lobbyPlayers,
  lobbyTables,
  minutesSince,
  playerCount,
} from '@/lib/lobby/lobby-data';
import {
  rememberTable,
  rememberedTable,
  serverNow,
  watchLobbyPlayers,
  watchLobbyTables,
} from '@/lib/lobby/lobby';
import { invitePlayer, useOutgoingInvites } from '@/lib/lobby/outgoing';
import { useLobbyPresence } from '@/lib/lobby/use-presence';
import { seatOf, seatedUids } from '@/lib/netcode/table-data';
import { createTable, readTable, type Table } from '@/lib/netcode/tables';
import { BotIcon, UsersIcon } from '../icons';
import gameStyles from '../game/game.module.css';
import { TableSettingsFields, TableSettingsSummary } from '../game/table-settings';
import { OnlinePlayers } from './online-players';
import { PlayerFace } from './player-face';
import { QuickPlayButton } from './quick-play-button';
import { RecentPlayers } from './recent-players';
import styles from './lobby.module.css';

type LobbyError = 'failed' | 'unavailable' | 'tableFailed';
type Notice = 'inviteLimit' | 'inviteFailed' | null;

// A guest's generated name usually arrives with the profile within a moment (as on tables).
const NAME_WAIT_MS = 3000;
// Table ages are shown in minutes.
const CLOCK_MS = 30_000;

export type LobbyViewProps = {
  gameId: string;
  slug: string;
  title: string;
  gamePath: string;
  /** Seats per table (the game's most players). */
  size: number;
  /** Every game's title by manifest id: what recent players play now (docs/adr/0021). */
  gameTitles: Record<string, string>;
};

// Recent players shown in the lobby (the profile lists more).
const RECENT_IN_LOBBY = 6;

/**
 * The lobby of a table game (docs/adr/0019-table-lobby-presence-invites.md): the public tables
 * with their free seats, the players online in this game, the player's recent players with their
 * site presence (docs/adr/0021), and invites to this player's table.
 */
export function LobbyView({ gameId, slug, title, gamePath, size, gameTitles }: LobbyViewProps) {
  const t = useTranslations('lobby');
  const tOnline = useTranslations('online');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const account = useAccount();
  const outgoing = useOutgoingInvites();

  const [error, setError] = useState<LobbyError | null>(() =>
    firebaseEnabled() ? null : 'unavailable',
  );
  const [tables, setTables] = useState<LobbyTable[] | null>(null);
  const [players, setPlayers] = useState<LobbyPresence[] | null>(null);
  const [myTable, setMyTable] = useState<Table | null>(null);
  const [nameTimedOut, setNameTimedOut] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [now, setNow] = useState(() => Date.now());
  // "Open a table": the settings form (docs/adr/0020).
  const [setup, setSetup] = useState(false);
  const [draft, setDraft] = useState<TableSettings>(DEFAULT_TABLE_SETTINGS);
  const [draftVisibility, setDraftVisibility] = useState<TableVisibility>('public');
  const startedRef = useRef(false);
  const setupRef = useRef<HTMLFormElement>(null);

  const uid = account.status === 'signedIn' ? account.uid : null;
  const profile = account.status === 'signedIn' ? account.profile : null;
  const name = profile?.username ?? (nameTimedOut ? tOnline('defaultName') : null);
  const character = profile?.characterId ?? null;

  useLobbyPresence(gameId, name, error ? null : 'lobby');

  // Everyone in the lobby needs an identity; a guest account is made on the spot.
  useEffect(() => {
    if (startedRef.current || error) return;
    startedRef.current = true;
    ensureGuest(locale).catch(() => setError('failed'));
    const timer = window.setTimeout(() => setNameTimedOut(true), NAME_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [error, locale]);

  // The live table list and player list.
  useEffect(() => {
    if (!uid || error === 'unavailable') return;
    let cancelled = false;
    const stops: Array<() => void> = [];
    const keep = (stop: () => void) => (cancelled ? stop() : stops.push(stop));
    watchLobbyTables(gameId, (next) => !cancelled && setTables(next))
      .then(keep)
      .catch(() => setError('failed'));
    watchLobbyPlayers(gameId, (next) => !cancelled && setPlayers(next))
      .then(keep)
      .catch(() => setError('failed'));
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, [uid, gameId, error]);

  // The table this player opened or joined here before, if they still sit at it.
  useEffect(() => {
    if (!uid) return;
    const code = rememberedTable(gameId);
    if (!code) return;
    let cancelled = false;
    readTable(code)
      .then((table) => {
        if (cancelled) return;
        const valid =
          table &&
          seatOf(table, uid) >= 0 &&
          table.status !== 'closed' &&
          serverNow() - table.createdAt < LOBBY_TABLE_TTL_MS;
        if (valid) setMyTable(table);
        else rememberTable(gameId, null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid, gameId]);

  // The form takes the focus when it opens.
  useEffect(() => {
    if (setup) setupRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, [setup]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const myCode = myTable?.code ?? null;
  const listed = useMemo(
    () => (tables ? lobbyTables(tables, serverNow(), myCode) : null),
    // `now` re-sorts and drops expired tables as time passes.
    [tables, myCode, now],
  );
  const sortedPlayers = useMemo(
    () => (players ? lobbyPlayers(players, uid) : null),
    [players, uid],
  );
  const seated = myTable ? seatedUids(myTable) : [];
  const myTableOpen = myTable?.status === 'open';

  async function openTable(
    settings: TableSettings = DEFAULT_TABLE_SETTINGS,
    visibility: TableVisibility = 'public',
  ): Promise<string | null> {
    if (!uid || !name) return null;
    try {
      const code = await createTable({
        uid,
        name,
        gameId,
        slug,
        size,
        character,
        visibility,
        settings,
      });
      rememberTable(gameId, code);
      return code;
    } catch (cause) {
      console.warn('[lobby] table failed', cause);
      setError('tableFailed');
      return null;
    }
  }

  async function onOpenTable() {
    setBusy('open');
    const code = await openTable(draft, draftVisibility);
    if (code) router.push(`${gamePath}/table/${code}`);
    else setBusy(null);
  }

  async function onInvite(to: string) {
    if (!uid || !name) return;
    setBusy(to);
    setNotice(null);
    // Without an open table, inviting opens a public one and takes the inviter there.
    const code = myTableOpen && myCode ? myCode : await openTable();
    if (!code) {
      setBusy(null);
      return;
    }
    const status = await invitePlayer({
      from: uid,
      fromName: name,
      fromCharacter: character,
      to,
      gameId,
      slug,
      tableCode: code,
    });
    if (status === 'limit') setNotice('inviteLimit');
    else if (status === 'failed') setNotice('inviteFailed');
    if (code !== myCode) {
      router.push(`${gamePath}/table/${code}`);
      return;
    }
    setBusy(null);
  }

  const loading = !error && (tables === null || players === null);

  return (
    <div
      className={styles.lobby}
      data-lobby-state={error ? 'error' : loading ? 'loading' : 'ready'}
    >
      <header className={gameStyles.titleRow}>
        <h1>
          <UsersIcon /> {t('title', { title })}
        </h1>
        <p className={gameStyles.meta}>
          <span>{t('intro')}</span>
          <Link href={gamePath}>{tOnline('backToGame', { title })}</Link>
        </p>
      </header>

      {error ? (
        <section className={gameStyles.card} role="alert">
          <p>{t(`error.${error}`)}</p>
          <p className={gameStyles.meta}>
            <Link href={gamePath}>{tOnline('backToGame', { title })}</Link>
          </p>
        </section>
      ) : null}

      {!error && loading ? (
        <section className={gameStyles.card} aria-busy="true">
          <p className={gameStyles.waiting} role="status">
            <span className={gameStyles.spinner} aria-hidden="true" />
            {t('preparing')}
          </p>
        </section>
      ) : null}

      {!error && !loading ? (
        <section className={styles.quick} aria-labelledby="lobby-quick">
          <div className={styles.quickText}>
            <h2 id="lobby-quick">{t('quickPlay')}</h2>
            <p>{t('quickPlayHint')}</p>
          </div>
          <div className={styles.quickAction}>
            <QuickPlayButton
              gameId={gameId}
              slug={slug}
              gamePath={gamePath}
              size={size}
              className={gameStyles.friendButton}
              disabled={busy !== null}
            />
          </div>
        </section>
      ) : null}

      {!error && !loading && myTable ? (
        <p className={styles.myTable} role="status">
          <span>{t('myTableNotice', { code: myTable.code })}</span>
          <Link href={`${gamePath}/table/${myTable.code}`} className={styles.linkButton}>
            {t('backToTable')}
          </Link>
        </p>
      ) : null}

      {!error && !loading && listed && sortedPlayers ? (
        <div className={styles.columns}>
          <section className={styles.panel} aria-labelledby="lobby-tables">
            <div className={styles.panelHead}>
              <h2 id="lobby-tables">{t('tablesTitle')}</h2>
              {!setup ? (
                <button
                  type="button"
                  className={styles.linkButton}
                  data-tone="quiet"
                  onClick={() => setSetup(true)}
                  disabled={busy !== null || !name}
                >
                  {t('openTable')}
                </button>
              ) : null}
            </div>
            {setup ? (
              <form
                ref={setupRef}
                className={styles.setup}
                aria-labelledby="lobby-open-table-title"
                onSubmit={(event) => {
                  event.preventDefault();
                  onOpenTable();
                }}
              >
                <h3 id="lobby-open-table-title">{t('openTableTitle')}</h3>
                <TableSettingsFields
                  id="lobby-table"
                  settings={draft}
                  onChange={setDraft}
                  visibility={draftVisibility}
                  onVisibility={setDraftVisibility}
                  disabled={busy !== null}
                />
                <div className={styles.setupActions}>
                  <button
                    type="submit"
                    className={gameStyles.friendButton}
                    disabled={busy !== null || !name}
                  >
                    {busy === 'open' ? t('opening') : t('openTableSubmit')}
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    data-tone="quiet"
                    onClick={() => setSetup(false)}
                    disabled={busy !== null}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </form>
            ) : null}
            {listed.length === 0 ? (
              <p className={styles.empty}>{t('noTables')}</p>
            ) : (
              <ul className={styles.tables}>
                {listed.map((table) => (
                  <TableRow
                    key={table.code}
                    table={table}
                    mine={table.code === myCode}
                    gamePath={gamePath}
                    now={serverNow()}
                  />
                ))}
              </ul>
            )}
          </section>

          <div className={styles.side}>
            <section className={styles.panel} aria-labelledby="lobby-players">
              <div className={styles.panelHead}>
                <h2 id="lobby-players">
                  {t('onlineTitle')}{' '}
                  <span className={styles.count}>
                    {t('onlineCount', { count: sortedPlayers.length })}
                  </span>
                </h2>
              </div>
              {notice ? (
                <p className={styles.notice} role="alert">
                  {t(notice)}
                </p>
              ) : null}
              <OnlinePlayers
                players={sortedPlayers}
                me={uid}
                seated={seated}
                canInvite={!!name && (!myTable || myTableOpen)}
                outgoing={outgoing}
                busy={busy}
                onInvite={(player) => onInvite(player.uid)}
              />
              {!sortedPlayers.some((player) => player.uid !== uid) ? (
                <p className={styles.empty}>{t('nobody')}</p>
              ) : !myTableOpen ? (
                <p className={styles.hint}>{t('inviteHint')}</p>
              ) : null}
            </section>
            <RecentPlayers
              uid={uid}
              show={RECENT_IN_LOBBY}
              titles={gameTitles}
              headingId="lobby-recent"
              className={styles.panel}
              canInvite={() => !!name && (!myTable || myTableOpen)}
              seated={seated}
              outgoing={outgoing}
              busy={busy}
              onInvite={(player) => onInvite(player.uid)}
              hidden={profile?.hideOnline === true}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TableRow({
  table,
  mine,
  gamePath,
  now,
}: {
  table: LobbyTable;
  mine: boolean;
  gamePath: string;
  now: number;
}) {
  const t = useTranslations('lobby');
  const free = freeSeatCount(table);
  const status = table.status === 'playing' ? 'playing' : free > 0 ? 'open' : 'full';
  const href = `${gamePath}/table/${table.code}`;
  return (
    <li className={styles.table} data-status={status} data-mine={mine || undefined}>
      <span className={styles.tableHost}>
        <PlayerFace uid={table.code} name={table.hostName} character={table.hostCharacter} />
        <span className={styles.tableText}>
          <strong className={styles.playerName}>{table.hostName}</strong>
          <span className={styles.playerMeta}>
            <span>{t('tableCode', { code: table.code })}</span>
            <span>{t('age', { minutes: minutesSince(table.createdAt, now) })}</span>
          </span>
        </span>
      </span>
      <span className={styles.seatRow}>
        <span className={styles.seatIcons} aria-hidden="true">
          {table.seats.map((seat, index) => (
            <span
              key={index}
              className={styles.seatIcon}
              data-kind={seat.kind}
              title={seat.kind === 'empty' ? t('emptySeat') : seat.name}
            >
              {seat.kind === 'player' ? (
                seat.name.charAt(0).toLocaleUpperCase()
              ) : seat.kind === 'bot' ? (
                <BotIcon size={16} />
              ) : null}
            </span>
          ))}
        </span>
        <span className="visually-hidden">
          {t('seatsSummary', {
            players: playerCount(table),
            bots: botCount(table),
            free,
          })}
        </span>
        <span className={styles.statusTag} data-status={status}>
          {status === 'open' ? t('freeSeats', { count: free }) : t(`status.${status}`)}
        </span>
      </span>
      <span className={styles.tableSettings}>
        <TableSettingsSummary
          settings={table.settings}
          autoStart={table.autoStart && table.status === 'open'}
        />
      </span>
      <span className={styles.tableAction}>
        {mine ? (
          <Link href={href} className={styles.linkButton} data-tone="quiet">
            {t('yourTable')}
          </Link>
        ) : canSit(table) ? (
          <Link
            href={href}
            className={styles.linkButton}
            aria-label={t('sitLabel', { code: table.code, name: table.hostName })}
          >
            {t('sit')}
          </Link>
        ) : null}
      </span>
    </li>
  );
}
