'use client';

import type { PresenceState } from '@ayvago/shared';
import { useEffect, useRef } from 'react';
import { useAccount } from '@/lib/account/store';
import { useSiteActivity } from '@/lib/presence/use-site-presence';
import { trackLobbyPresence, type PresenceHandle, type PresenceInfo } from './lobby';

/**
 * Shows the signed-in player in the game's lobby list while the page is open (the lobby page
 * and the table page). `state` null keeps them out; `name` is the name they play under. The same
 * state goes into the player's site presence (docs/adr/0021). A player who turned "Show me as
 * online" off is not listed.
 */
export function useLobbyPresence(
  gameId: string,
  name: string | null,
  state: PresenceState | null,
): void {
  const account = useAccount();
  const uid = account.status === 'signedIn' ? account.uid : null;
  const profile = account.status === 'signedIn' ? account.profile : null;
  // The page holds the database connection either way (tables, lists); see ADR 0021.
  useSiteActivity(state, gameId, true);
  const info: PresenceInfo | null =
    name && state && profile && !profile.hideOnline
      ? {
          name,
          state,
          character: profile?.characterId ?? null,
          level: profile ? profile.level : null,
          dnd: profile?.invitesOff ?? false,
        }
      : null;
  const infoRef = useRef(info);
  infoRef.current = info;
  const handleRef = useRef<PresenceHandle | null>(null);
  const active = !!uid && info !== null;

  useEffect(() => {
    if (!active || !uid || !infoRef.current) return;
    let cancelled = false;
    trackLobbyPresence(gameId, uid, infoRef.current)
      .then((handle) => {
        if (cancelled) handle.stop();
        else {
          handleRef.current = handle;
          // Changes made while it was starting.
          if (infoRef.current) handle.update(infoRef.current);
        }
      })
      .catch((error) => console.warn('[lobby] presence failed', error));
    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [active, gameId, uid]);

  const key = info ? JSON.stringify(info) : '';
  useEffect(() => {
    if (key && infoRef.current) handleRef.current?.update(infoRef.current);
  }, [key]);
}
