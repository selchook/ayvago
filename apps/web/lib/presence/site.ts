'use client';

// Site-wide presence (docs/adr/0021-site-presence-recent-players.md): presence/site/{uid} says
// that a signed-in player is on ayvago.com and what they are doing there. Pages say what they
// are (a lobby, a table, a game) through claims; the busiest claim of the tab is written. One
// entry per player: the last tab to write wins, and a tab whose entry vanished while it is still
// connected (another tab closed) writes it again.
import {
  readSitePresence,
  siteStateRank,
  sitePresenceRecord,
  type CharacterId,
  type SitePresence,
  type SiteState,
} from '@ayvago/shared';
import type { Unsubscribe } from 'firebase/database';
import { loadDatabase } from '@/lib/firebase/client';

// ---------------------------------------------------------------------------------------------
// What this tab is doing: claims by the pages on screen.

export type SiteActivity = {
  state: SiteState;
  gameId: string | null;
  /** A page needs the database connection (a lobby, table or room): never go offline. */
  hold: boolean;
};

type Claim = SiteActivity & { at: number };

const claims = new Map<number, Claim>();
let claimSeq = 0;
const IDLE: SiteActivity = { state: 'online', gameId: null, hold: false };
let activity: SiteActivity = IDLE;
const activityListeners = new Set<() => void>();

function recompute() {
  let best: Claim | null = null;
  let hold = false;
  for (const claim of claims.values()) {
    hold ||= claim.hold;
    const rank = siteStateRank(claim.state);
    if (
      !best ||
      rank > siteStateRank(best.state) ||
      (rank === siteStateRank(best.state) && claim.at > best.at)
    ) {
      best = claim;
    }
  }
  const next: SiteActivity = best ? { state: best.state, gameId: best.gameId, hold } : IDLE;
  if (
    next.state === activity.state &&
    next.gameId === activity.gameId &&
    next.hold === activity.hold
  ) {
    return;
  }
  activity = next;
  activityListeners.forEach((listener) => listener());
}

/** A page says what the player does on it until it releases the claim (unmounts). */
export function claimSiteActivity(claim: SiteActivity): () => void {
  const id = ++claimSeq;
  claims.set(id, { ...claim, at: id });
  recompute();
  return () => {
    claims.delete(id);
    recompute();
  };
}

export function subscribeSiteActivity(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

export function currentSiteActivity(): SiteActivity {
  return activity;
}

export function idleSiteActivity(): SiteActivity {
  return IDLE;
}

// ---------------------------------------------------------------------------------------------
// This player's entry.

export type SitePresenceInfo = {
  name: string;
  character: CharacterId | null;
  level: number | null;
  state: SiteState;
  gameId: string | null;
  dnd: boolean;
};

export type SitePresenceHandle = {
  update(info: SitePresenceInfo): void;
  /** The tab came to the front: its state becomes the player's state. */
  refresh(): void;
  stop(): void;
};

/**
 * Writes presence/site/{uid} while the page is connected; the server removes it when the
 * connection drops (onDisconnect). Listens to that one entry only, to rewrite it when another tab
 * of the same player closed and took it away.
 */
export async function trackSitePresence(
  uid: string,
  initial: SitePresenceInfo,
): Promise<SitePresenceHandle> {
  const db = await loadDatabase();
  const { ref, onValue, onDisconnect, set, remove, serverTimestamp } =
    await import('firebase/database');
  const mine = ref(db, `presence/site/${uid}`);
  let info = initial;
  // The entry as the database holds it (null: none).
  let stored: SitePresence | null = null;
  let ready = false;
  let stopped = false;
  const warn = (error: unknown) => console.warn('[presence] site presence failed', error);

  const write = () => {
    if (!ready || stopped) return;
    // `since` is when the state began: kept while the state and game stay the same.
    const same = stored && stored.state === info.state && stored.gameId === info.gameId;
    set(mine, sitePresenceRecord(info, same && stored ? stored.since : serverTimestamp())).catch(
      warn,
    );
  };

  const stopConnected = onValue(ref(db, '.info/connected'), (snapshot) => {
    ready = false;
    if (snapshot.val() !== true || stopped) return;
    onDisconnect(mine)
      .remove()
      .then(() => {
        if (stopped) return;
        ready = true;
        stored = null;
        write();
      })
      .catch(warn);
  });
  const stopOwn = onValue(
    mine,
    (snapshot) => {
      stored = readSitePresence(uid, snapshot.val());
      // Another tab of this player closed: its disconnect removed the shared entry.
      if (!stored && ready && !stopped) write();
    },
    () => undefined,
  );

  return {
    update(next) {
      const before = JSON.stringify(info);
      info = next;
      if (JSON.stringify(next) !== before) write();
    },
    refresh() {
      const current = stored;
      if (
        !current ||
        current.state !== info.state ||
        current.gameId !== info.gameId ||
        current.dnd !== info.dnd
      ) {
        write();
      }
    },
    stop() {
      stopped = true;
      stopConnected();
      stopOwn();
      remove(mine).catch(() => undefined);
      onDisconnect(mine)
        .cancel()
        .catch(() => undefined);
    },
  };
}

/** Takes this tab off the database (hidden for long) or back on. */
export async function setDatabaseOnline(online: boolean): Promise<void> {
  const db = await loadDatabase();
  const { goOffline, goOnline } = await import('firebase/database');
  if (online) goOnline(db);
  else goOffline(db);
}

// ---------------------------------------------------------------------------------------------
// Other players: one entry at a time (the root cannot be listed).

/** Live presence of one player; null while they are offline or hidden. */
export async function watchSitePresence(
  uid: string,
  onPresence: (presence: SitePresence | null) => void,
): Promise<Unsubscribe> {
  const db = await loadDatabase();
  const { ref, onValue } = await import('firebase/database');
  return onValue(
    ref(db, `presence/site/${uid}`),
    (snapshot) => onPresence(readSitePresence(uid, snapshot.val())),
    (error) => {
      console.warn('[presence] presence read failed', error);
      onPresence(null);
    },
  );
}
