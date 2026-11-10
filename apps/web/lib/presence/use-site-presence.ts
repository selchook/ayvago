'use client';

import type { SiteState } from '@ayvago/shared';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAccount } from '@/lib/account/store';
import {
  claimSiteActivity,
  currentSiteActivity,
  idleSiteActivity,
  setDatabaseOnline,
  subscribeSiteActivity,
  trackSitePresence,
  type SitePresenceHandle,
  type SitePresenceInfo,
} from './site';

/** A tab hidden this long without a lobby, table or room leaves the database (ADR 0021). */
export const AWAY_AFTER_MS = 10 * 60 * 1000;

/**
 * Says what the player does on this page (docs/adr/0021): `state` null claims nothing. `hold`
 * pages (lobby, table, room) need the database anyway, so they connect at once and never go
 * offline while hidden.
 */
export function useSiteActivity(state: SiteState | null, gameId: string | null, hold = false) {
  useEffect(() => {
    if (!state) return;
    return claimSiteActivity({ state, gameId, hold });
  }, [state, gameId, hold]);
}

// A tab connects for site presence only after its player has used it (a tap, a key, a scroll
// wheel): a page left open in the background, or opened and never touched, costs no connection.
let interacted = false;
const interactionListeners = new Set<() => void>();
const INTERACTIONS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

function onFirstInteraction() {
  if (interacted) return;
  interacted = true;
  INTERACTIONS.forEach((type) => window.removeEventListener(type, onFirstInteraction, true));
  interactionListeners.forEach((listener) => listener());
}

function subscribeInteraction(listener: () => void) {
  if (!interacted && interactionListeners.size === 0) {
    INTERACTIONS.forEach((type) =>
      window.addEventListener(type, onFirstInteraction, { capture: true, passive: true }),
    );
  }
  interactionListeners.add(listener);
  return () => interactionListeners.delete(listener);
}

/**
 * Keeps the signed-in player's site presence (presence/site/{uid}) while this tab is in use. Used
 * once, by the invite notifier in the top bar. Writes nothing when the player turned "Show me as
 * online" off, before the first interaction, or after the tab was hidden for AWAY_AFTER_MS
 * (then the tab also leaves the database unless a page holds it). Returns whether the entry is
 * kept by this tab: invites can reach the player only then.
 */
export function useSitePresence(): boolean {
  const account = useAccount();
  const activity = useSyncExternalStore(
    subscribeSiteActivity,
    currentSiteActivity,
    idleSiteActivity,
  );
  const used = useSyncExternalStore(
    subscribeInteraction,
    () => interacted,
    () => false,
  );
  const [away, setAway] = useState(false);
  const [present, setPresent] = useState(false);
  const handleRef = useRef<SitePresenceHandle | null>(null);
  const holdRef = useRef(activity.hold);
  holdRef.current = activity.hold;
  const offlineRef = useRef(false);

  const uid = account.status === 'signedIn' ? account.uid : null;
  const profile = account.status === 'signedIn' ? account.profile : null;
  const info: SitePresenceInfo | null =
    uid && profile?.username && !profile.hideOnline
      ? {
          name: profile.username,
          character: profile.characterId,
          level: profile.level,
          state: activity.state,
          gameId: activity.gameId,
          dnd: profile.invitesOff,
        }
      : null;
  const infoRef = useRef(info);
  infoRef.current = info;
  const wanted = info !== null && (used || activity.hold) && !away;

  useEffect(() => {
    if (!wanted || !uid || !infoRef.current) return;
    let cancelled = false;
    trackSitePresence(uid, infoRef.current)
      .then((handle) => {
        if (cancelled) {
          handle.stop();
          return;
        }
        handleRef.current = handle;
        if (infoRef.current) handle.update(infoRef.current);
        setPresent(true);
      })
      .catch((error) => console.warn('[presence] site presence failed', error));
    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
      setPresent(false);
    };
  }, [wanted, uid]);

  const key = info ? JSON.stringify(info) : '';
  useEffect(() => {
    if (key && infoRef.current) handleRef.current?.update(infoRef.current);
  }, [key]);

  // Hidden for long: away (and off the database when no page holds it). Back in front: this
  // tab's state becomes the player's.
  useEffect(() => {
    let timer: number | undefined;
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(() => {
          if (holdRef.current) return;
          setAway(true);
          if (handleRef.current) {
            offlineRef.current = true;
            setDatabaseOnline(false).catch(() => undefined);
          }
        }, AWAY_AFTER_MS);
        return;
      }
      setAway(false);
      if (offlineRef.current) {
        offlineRef.current = false;
        setDatabaseOnline(true).catch(() => undefined);
      }
      handleRef.current?.refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return present && !away;
}
