'use client';

import { RECENT_PLAYERS_LIMIT, type RecentPlayer, type SitePresence } from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { canInviteAgain } from '@/lib/lobby/lobby-data';
import type { Outgoing } from '@/lib/lobby/outgoing';
import { usePresenceOf, useRecentPlayers } from '@/lib/presence/recent';
import { recentAction, timeAgo } from '@/lib/presence/recent-data';
import { PlayerFace } from './player-face';
import styles from './lobby.module.css';

// "Ago" times are shown in minutes.
const CLOCK_MS = 30_000;

export type RecentPlayersProps = {
  uid: string | null;
  /** Rows shown at first; with `expandable` the player can show up to RECENT_PLAYERS_LIMIT. */
  show: number;
  expandable?: boolean;
  /** Game titles by manifest id (the shared game and what an online player is doing). */
  titles: Record<string, string>;
  headingId: string;
  className?: string;
  /** Whether this page can invite the player now (it has, or may open, a table for the game). */
  canInvite(player: RecentPlayer): boolean;
  /** Players already at this player's table. */
  seated?: string[];
  outgoing: Record<string, Outgoing>;
  busy: string | null;
  onInvite(player: RecentPlayer): void;
  /** This player turned "Show me as online" off: say so, with a link to the setting. */
  hidden?: boolean;
};

/**
 * "Recent players" (docs/adr/0021-site-presence-recent-players.md): people this player shared a
 * table or a room with, newest first, each with their online status (read one by one, only for
 * the rows on screen) and Invite while they are online and take invites.
 */
export function RecentPlayers(props: RecentPlayersProps) {
  const { uid, show, expandable, titles, headingId, className, seated = [] } = props;
  const { canInvite, outgoing, busy, onInvite, hidden } = props;
  const t = useTranslations('presence');
  const tLobby = useTranslations('lobby');
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { players, failed } = useRecentPlayers(uid, expandable ? RECENT_PLAYERS_LIMIT : show);
  const shown = players ? players.slice(0, expanded ? RECENT_PLAYERS_LIMIT : show) : [];
  const presence = usePresenceOf(shown.map((player) => player.uid));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const stateText = (entry: SitePresence) => {
    const state = t(`state.${entry.state}`);
    const game = entry.gameId ? titles[entry.gameId] : undefined;
    return game ? t('stateIn', { state, game }) : state;
  };

  return (
    <section className={className} aria-labelledby={headingId} data-recent-players>
      <div className={styles.panelHead}>
        <h2 id={headingId}>{t('recentTitle')}</h2>
      </div>
      {hidden ? (
        <p className={styles.hint} data-hidden-note>
          {t('hiddenNote')} <Link href="/profile">{t('settingsLink')}</Link>
        </p>
      ) : null}
      {players === null ? (
        <p className={styles.empty} role="status">
          {t('loading')}
        </p>
      ) : failed ? (
        <p className={styles.empty} role="alert">
          {t('failed')}
        </p>
      ) : players.length === 0 ? (
        <p className={styles.empty}>{t('recentEmpty')}</p>
      ) : (
        <ul className={styles.players}>
          {shown.map((player) => {
            const entry = presence[player.uid];
            const action = recentAction(entry, seated.includes(player.uid));
            const online = entry !== undefined && entry !== null;
            const game = titles[player.gameId] ?? player.slug;
            const ago = timeAgo(player.lastPlayedAt, now);
            const status = outgoing[player.uid]?.status;
            const waiting = !canInviteAgain(status);
            return (
              <li
                key={player.uid}
                className={styles.player}
                data-recent-uid={player.uid}
                data-online={online || undefined}
              >
                <PlayerFace uid={player.uid} name={player.name} character={player.character} />
                <span className={styles.playerText}>
                  <strong className={styles.playerName}>{player.name}</strong>
                  <span className={styles.playerMeta}>
                    {game} · {t('times', { count: player.count })} ·{' '}
                    {t(`ago.${ago.unit}`, { count: ago.count })}
                  </span>
                  <span className={styles.presence} data-online={online || undefined}>
                    <span className={styles.dot} aria-hidden="true" />
                    {entry ? stateText(entry) : t('state.offline')}
                  </span>
                </span>
                {action === 'seated' ? (
                  <span className={styles.playerNote}>{tLobby('atYourTable')}</span>
                ) : action === 'noInvites' ? (
                  <span className={styles.playerNote}>{tLobby('noInvites')}</span>
                ) : action === 'invite' && canInvite(player) ? (
                  <span className={styles.playerAction}>
                    {status && !waiting ? (
                      <span className={styles.playerNote} data-status={status}>
                        {tLobby(`inviteStatus.${status}`)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={styles.inviteButton}
                      data-status={waiting ? status : undefined}
                      disabled={waiting || busy !== null}
                      aria-label={
                        waiting && status
                          ? `${player.name}: ${tLobby(`inviteStatus.${status}`)}`
                          : tLobby('inviteLabel', { name: player.name })
                      }
                      onClick={() => onInvite(player)}
                    >
                      {waiting && status ? tLobby(`inviteStatus.${status}`) : tLobby('invite')}
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {expandable && players && players.length > show ? (
        <button
          type="button"
          className={styles.linkButton}
          data-tone="quiet"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('showLess') : t('showAll', { count: players.length })}
        </button>
      ) : null}
    </section>
  );
}
