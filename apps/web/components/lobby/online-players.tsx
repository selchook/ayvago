'use client';

import type { LobbyPresence } from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { canInviteAgain } from '@/lib/lobby/lobby-data';
import type { Outgoing } from '@/lib/lobby/outgoing';
import { PlayerFace } from './player-face';
import styles from './lobby.module.css';

export type OnlinePlayersProps = {
  /** Already sorted (lobbyPlayers). */
  players: LobbyPresence[];
  me: string | null;
  /** Players seated at this player's table: they need no invite. */
  seated: string[];
  /** Whether this player can invite now (has an open table or may open one). */
  canInvite: boolean;
  outgoing: Record<string, Outgoing>;
  /** The player being invited right now (button busy). */
  busy: string | null;
  onInvite(player: LobbyPresence): void;
  /** Leave this player out (the table page lists the others only). */
  hideMe?: boolean;
};

/** Who is in the lobby or at a table of this game, with an Invite button for each. */
export function OnlinePlayers(props: OnlinePlayersProps) {
  const { players, me, seated, canInvite, outgoing, busy, onInvite, hideMe } = props;
  const t = useTranslations('lobby');
  const shown = hideMe ? players.filter((player) => player.uid !== me) : players;

  return (
    <ul className={styles.players}>
      {shown.map((player) => {
        const isMe = player.uid === me;
        const atMyTable = seated.includes(player.uid);
        const sent = outgoing[player.uid];
        const status = sent?.status;
        const waiting = !canInviteAgain(status);
        return (
          <li
            key={player.uid}
            className={styles.player}
            data-me={isMe || undefined}
            data-state={player.state}
          >
            <PlayerFace uid={player.uid} name={player.name} character={player.character} />
            <span className={styles.playerText}>
              <strong className={styles.playerName}>
                {player.name}
                {isMe ? <small> ({t('you')})</small> : null}
              </strong>
              <span className={styles.playerMeta}>
                {player.level ? <span>{t('level', { level: player.level })}</span> : null}
                <span className={styles.stateTag} data-state={player.state}>
                  {t(`state.${player.state}`)}
                </span>
              </span>
            </span>
            {isMe ? null : atMyTable ? (
              <span className={styles.playerNote}>{t('atYourTable')}</span>
            ) : player.dnd ? (
              <span className={styles.playerNote}>{t('noInvites')}</span>
            ) : canInvite ? (
              <span className={styles.playerAction}>
                {/* The last answer stays next to the button, which invites again. */}
                {status && !waiting ? (
                  <span className={styles.playerNote} data-status={status}>
                    {t(`inviteStatus.${status}`)}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={styles.inviteButton}
                  data-status={waiting ? status : undefined}
                  disabled={waiting || busy !== null}
                  aria-label={
                    waiting && status
                      ? `${player.name}: ${t(`inviteStatus.${status}`)}`
                      : t('inviteLabel', { name: player.name })
                  }
                  onClick={() => onInvite(player)}
                >
                  {waiting && status ? t(`inviteStatus.${status}`) : t('invite')}
                </button>
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
