'use client';

// Invites this player sent, shared by the lobby page and the table page (the inviter usually
// moves from one to the other right after inviting). Kept outside React so a page change keeps
// them. docs/adr/0019-table-lobby-presence-invites.md
import { INVITE_TTL_MS, type CharacterId, type TableInvite } from '@ayvago/shared';
import { useSyncExternalStore } from 'react';
import { outgoingStatus, type OutgoingStatus } from './lobby-data';
import { deleteInvite, sendInvite, serverNow, watchSentInvite } from './lobby';

export type Outgoing = { to: string; tableCode: string; status: OutgoingStatus };

let invites: Record<string, Outgoing> = {};
const stops = new Map<string, () => void>();
const listeners = new Set<() => void>();

function set(to: string, value: Outgoing | null) {
  const next = { ...invites };
  if (value) next[to] = value;
  else delete next[to];
  invites = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: Record<string, Outgoing> = {};

/** Sent invites by recipient uid. */
export function useOutgoingInvites(): Record<string, Outgoing> {
  return useSyncExternalStore(
    subscribe,
    () => invites,
    () => EMPTY,
  );
}

/** Sends an invite and follows it until it is answered or expires. */
export async function invitePlayer(input: {
  from: string;
  fromName: string;
  fromCharacter: CharacterId | null;
  to: string;
  gameId: string;
  slug: string;
  tableCode: string;
}): Promise<OutgoingStatus> {
  const { to, from, tableCode } = input;
  stops.get(to)?.();
  stops.delete(to);
  set(to, { to, tableCode, status: 'sending' });
  const result = await sendInvite(input);
  if (result !== 'sent') {
    set(to, { to, tableCode, status: result });
    return result;
  }
  const sentAt = serverNow();
  let seen = false;
  let last: TableInvite | null = null;
  let finished = false;
  const finish = (status: OutgoingStatus) => {
    if (finished) return;
    finished = true;
    set(to, { to, tableCode, status });
    stops.get(to)?.();
    stops.delete(to);
    // The sender clears what is left; an answered invite has done its job.
    deleteInvite(to, from).catch(() => undefined);
  };
  const update = () => {
    const status = outgoingStatus(last, seen, sentAt, serverNow());
    if (status === 'pending' || status === 'sending') set(to, { to, tableCode, status: 'pending' });
    else finish(status);
  };
  const timer = window.setTimeout(update, INVITE_TTL_MS + 1000);
  const unwatch = await watchSentInvite(to, from, (invite) => {
    if (invite && invite.tableCode !== tableCode) return;
    if (invite) seen = true;
    last = invite;
    update();
  });
  if (finished) {
    unwatch();
    window.clearTimeout(timer);
  } else {
    stops.set(to, () => {
      unwatch();
      window.clearTimeout(timer);
    });
  }
  return 'pending';
}

/**
 * The sender left the table (slice 5.20): invites to it that are still open are taken back, so
 * nobody joins a table to play with someone who is gone.
 */
export function withdrawInvites(from: string, tableCode: string): void {
  for (const invite of Object.values(invites)) {
    if (invite.tableCode !== tableCode || invite.status !== 'pending') continue;
    stops.get(invite.to)?.();
    stops.delete(invite.to);
    set(invite.to, null);
    deleteInvite(invite.to, from).catch(() => undefined);
  }
}
