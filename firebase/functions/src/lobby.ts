import {
  INVITE_TTL_MS,
  INVITE_WINDOW_MS,
  summarizeTable,
} from '../../../packages/shared/src/lobby';
import type { Reference } from 'firebase-admin/database';
import { rtdb } from './admin';

// The lobby of a table game (docs/adr/0019-table-lobby-presence-invites.md). Clients cannot list
// tables/ (it holds uids); this trigger keeps a public summary of every public table under
// lobby/{gameId}/tables/{code}, which signed-in players read. Only this code writes there.

export type LobbySync = 'set' | 'removed' | 'unchanged';

const entryPath = (gameId: string, code: string) => `lobby/${gameId}/tables/${code}`;

function gameIdOf(value: unknown): string | null {
  const gameId = (value as { gameId?: unknown } | null)?.gameId;
  return typeof gameId === 'string' && /^[a-z0-9]{3,32}$/.test(gameId) ? gameId : null;
}

/**
 * Brings the lobby entry of table `code` up to date after a write from `before` to `after`.
 * Events can arrive late or out of order, so the entry is built from the table as it is now,
 * not from the event; the event only decides whether anything the lobby shows changed. `root` is
 * the database the event came from (the default instance in production).
 */
export async function syncLobbyTable(
  code: string,
  before: unknown,
  after: unknown,
  root: Reference = rtdb().ref(),
): Promise<LobbySync> {
  const was = summarizeTable(before);
  const is = summarizeTable(after);
  if (JSON.stringify(was) === JSON.stringify(is)) return 'unchanged';

  const current = (await root.child(`tables/${code}`).get()).val() as unknown;
  const summary = summarizeTable(current);
  const updates: Record<string, unknown> = {};
  // A table never changes its game (the rules keep gameId), but clean every old place anyway.
  for (const gameId of new Set([gameIdOf(before), gameIdOf(after), gameIdOf(current)])) {
    if (gameId && gameId !== summary?.gameId) updates[entryPath(gameId, code)] = null;
  }
  if (summary) updates[entryPath(summary.gameId, code)] = summary;
  if (Object.keys(updates).length === 0) return 'unchanged';
  await root.update(updates);
  return summary ? 'set' : 'removed';
}

/**
 * Hourly cleanup next to deleteOldTables: lobby entries of tables created before `cutoff`
 * (normally gone with their table already), quick-play pointers set before `cutoff` (their table
 * is gone too; docs/adr/0020), invites older than ten invite lifetimes and invite quotas whose
 * window ended an hour ago. Returns the counts.
 */
export async function deleteStaleLobbyData(
  cutoff: number,
  now = Date.now(),
): Promise<{ entries: number; invites: number; quotas: number; pointers: number }> {
  const updates: Record<string, null> = {};
  let entries = 0;
  let invites = 0;
  let quotas = 0;
  let pointers = 0;

  const lobby = await rtdb().ref('lobby').get();
  lobby.forEach((game) => {
    game.child('tables').forEach((entry) => {
      const createdAt = entry.child('createdAt').val() as unknown;
      if (typeof createdAt !== 'number' || createdAt < cutoff) {
        updates[`lobby/${game.key}/tables/${entry.key}`] = null;
        entries++;
      }
    });
  });

  const inviteCutoff = now - 10 * INVITE_TTL_MS;
  const inbox = await rtdb().ref('invites').get();
  inbox.forEach((to) => {
    to.forEach((invite) => {
      const createdAt = invite.child('createdAt').val() as unknown;
      if (typeof createdAt !== 'number' || createdAt < inviteCutoff) {
        updates[`invites/${to.key}/${invite.key}`] = null;
        invites++;
      }
    });
  });

  const quotaCutoff = now - INVITE_WINDOW_MS - 60 * 60 * 1000;
  const quota = await rtdb().ref('inviteQuota').get();
  quota.forEach((entry) => {
    const start = entry.child('start').val() as unknown;
    if (typeof start !== 'number' || start < quotaCutoff) {
      updates[`inviteQuota/${entry.key}`] = null;
      quotas++;
    }
  });

  const quick = await rtdb().ref('quickPlay').get();
  quick.forEach((pointer) => {
    const at = pointer.child('at').val() as unknown;
    if (typeof at !== 'number' || at < cutoff) {
      updates[`quickPlay/${pointer.key}`] = null;
      pointers++;
    }
  });

  if (Object.keys(updates).length > 0) await rtdb().ref().update(updates);
  return { entries, invites, quotas, pointers };
}
