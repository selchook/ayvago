// What the "Recent players" lists show (docs/adr/0021-site-presence-recent-players.md). Pure, so
// tests can import it without Firebase.
import type { SitePresence } from '@ayvago/shared';

export type Ago = { unit: 'minutes' | 'hours' | 'days'; count: number };

/** "2 h ago": whole minutes below an hour, hours below a day, then days. */
export function timeAgo(at: number, now: number): Ago {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
}

/**
 * What can be done about a recent player now:
 * - `offline`: no site presence (offline, away, or "Show me as online" is off);
 * - `noInvites`: online but not taking invites;
 * - `seated`: already at this player's table;
 * - `invite`: online and can be invited.
 * `presence` undefined means it is still loading (shown as offline, without a button).
 */
export type RecentAction = 'loading' | 'offline' | 'noInvites' | 'seated' | 'invite';

export function recentAction(
  presence: SitePresence | null | undefined,
  seated: boolean,
): RecentAction {
  if (presence === undefined) return 'loading';
  if (presence === null) return 'offline';
  if (seated) return 'seated';
  if (presence.dnd) return 'noInvites';
  return 'invite';
}
