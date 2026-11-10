'use client';

import { LOBBY_TABLE_TTL_MS, type RecentPlayer } from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAccount } from '@/lib/account/store';
import { rememberTable, rememberedTable, serverNow } from '@/lib/lobby/lobby';
import { invitePlayer, useOutgoingInvites } from '@/lib/lobby/outgoing';
import { seatOf } from '@/lib/netcode/table-data';
import { createTable, readTable } from '@/lib/netcode/tables';
import { RecentPlayers } from '../lobby/recent-players';
import lobbyStyles from '../lobby/lobby.module.css';
import styles from './profile.module.css';

export type TableGame = { gameId: string; slug: string; size: number };

type Notice = 'inviteLimit' | 'inviteFailed' | 'tableFailed' | null;

/**
 * The profile's "Recent players" (docs/adr/0021): everyone this player shared a table or a room
 * with, with their online status. Invite asks them to the table game played together: it uses
 * the player's open table of that game, or opens a public one, and goes there.
 */
export function RecentSection({
  titles,
  tableGames,
}: {
  /** Game titles by manifest id. */
  titles: Record<string, string>;
  /** Live table games by manifest id: only these can be invited to. */
  tableGames: Record<string, TableGame>;
}) {
  const t = useTranslations('lobby');
  const router = useRouter();
  const account = useAccount();
  const outgoing = useOutgoingInvites();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const uid = account.status === 'signedIn' ? account.uid : null;
  const profile = account.status === 'signedIn' ? account.profile : null;
  const name = profile?.username ?? null;

  /** The player's own open table of the game, if they still sit at it. */
  async function openTableOf(game: TableGame): Promise<string | null> {
    const remembered = rememberedTable(game.gameId);
    if (!uid || !remembered) return null;
    const table = await readTable(remembered).catch(() => null);
    const valid =
      table &&
      seatOf(table, uid) >= 0 &&
      table.status === 'open' &&
      serverNow() - table.createdAt < LOBBY_TABLE_TTL_MS;
    if (valid) return remembered;
    rememberTable(game.gameId, null);
    return null;
  }

  async function onInvite(player: RecentPlayer) {
    const game = tableGames[player.gameId];
    if (!uid || !name || !game) return;
    setBusy(player.uid);
    setNotice(null);
    let code = await openTableOf(game);
    if (!code) {
      try {
        code = await createTable({
          uid,
          name,
          gameId: game.gameId,
          slug: game.slug,
          size: game.size,
          character: profile?.characterId ?? null,
          visibility: 'public',
        });
        rememberTable(game.gameId, code);
      } catch (cause) {
        console.warn('[profile] table failed', cause);
        setNotice('tableFailed');
        setBusy(null);
        return;
      }
    }
    const status = await invitePlayer({
      from: uid,
      fromName: name,
      fromCharacter: profile?.characterId ?? null,
      to: player.uid,
      gameId: game.gameId,
      slug: game.slug,
      tableCode: code,
    });
    if (status === 'limit') setNotice('inviteLimit');
    else if (status === 'failed') setNotice('inviteFailed');
    // The table is open either way: the inviter waits there, as in the lobby.
    router.push(`/games/${game.slug}/table/${code}`);
  }

  if (!uid) return null;
  return (
    <div className={styles.recent}>
      {notice ? (
        <p className={lobbyStyles.notice} role="alert">
          {notice === 'tableFailed' ? t('error.tableFailed') : t(notice)}
        </p>
      ) : null}
      <RecentPlayers
        uid={uid}
        show={8}
        expandable
        titles={titles}
        headingId="recent-heading"
        className={styles.card}
        canInvite={(player) => !!name && player.gameId in tableGames}
        outgoing={outgoing}
        busy={busy}
        onInvite={onInvite}
        hidden={profile?.hideOnline === true}
      />
    </div>
  );
}
