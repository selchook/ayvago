'use client';

import { invitePending, INVITE_TTL_MS, type TableInvite } from '@ayvago/shared';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from '@/i18n/navigation';
import { useAccount } from '@/lib/account/store';
import { playInviteChime } from '@/lib/lobby/chime';
import { answerInvite, deleteInvite, serverNow, watchInbox } from '@/lib/lobby/lobby';
import { useSitePresence } from '@/lib/presence/use-site-presence';
import { BellIcon } from '../icons';
import popover from '../popover.module.css';
import { PlayerFace } from './player-face';
import styles from './invite-center.module.css';

const MAX_TOASTS = 3;
const inviteKey = (invite: TableInvite) => `${invite.fromUid}:${invite.createdAt}`;

/** A game round is on screen, or the player is typing: an invite must not take the focus. */
function shouldStayQuiet(): boolean {
  if (document.querySelector('[data-phase="playing"]')) return true;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  return (
    active.tagName === 'IFRAME' ||
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.isContentEditable
  );
}

/**
 * Table invites anywhere on the site (docs/adr/0019-table-lobby-presence-invites.md): a bell
 * with the number of open invites in the top bar, and a toast for each new one with Join and
 * Decline. Outside a game round the toast is a small alert dialog that takes the focus and plays
 * a soft chime; during a round (or while the player types) it appears without sound or focus
 * change and is announced politely. It also keeps the player's site presence
 * (docs/adr/0021-site-presence-recent-players.md) and listens for invites only while this tab
 * holds it: the rules let invites reach only players who are present.
 */
export function InviteCenter({ titles }: { titles: Record<string, string> }) {
  const t = useTranslations('invites');
  const router = useRouter();
  const account = useAccount();
  const uid = account.status === 'signedIn' ? account.uid : null;
  const invitesOff = account.status === 'signedIn' && account.profile?.invitesOff === true;

  const present = useSitePresence();
  const listening = present && !invitesOff;
  const [inbox, setInbox] = useState<TableInvite[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [quiet, setQuiet] = useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = useState('');
  // Ticks once a second while an invite is open, so the countdown and expiry re-render.
  const [, setTick] = useState(0);
  const [host, setHost] = useState<Element | null>(null);
  const seenRef = useRef(new Set<string>());
  const clearedRef = useRef(new Set<string>());
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const bellRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!uid || !listening) {
      setInbox([]);
      return;
    }
    let cancelled = false;
    let stop: (() => void) | null = null;
    watchInbox(uid, (invites) => !cancelled && setInbox(invites))
      .then((unsubscribe) => (cancelled ? unsubscribe() : (stop = unsubscribe)))
      .catch((error) => console.warn('[lobby] invites failed', error));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [uid, listening]);

  // Toasts live in the fullscreen element while a game is fullscreen, else in the body.
  useEffect(() => {
    const place = () => setHost(document.fullscreenElement ?? document.body);
    place();
    document.addEventListener('fullscreenchange', place);
    return () => document.removeEventListener('fullscreenchange', place);
  }, []);

  const serverTime = serverNow();
  const pending = invitesOff
    ? []
    : inbox
        .filter((invite) => invitePending(invite, serverTime))
        .sort((a, b) => b.createdAt - a.createdAt);

  // A clock for the countdown, only while something is pending.
  useEffect(() => {
    if (pending.length === 0) return;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [pending.length]);

  // Expired, unanswered invites are cleared from the inbox; the sender sees "no answer".
  useEffect(() => {
    if (!uid) return;
    for (const invite of inbox) {
      const key = inviteKey(invite);
      if (
        !invite.answer &&
        serverTime - invite.createdAt >= INVITE_TTL_MS &&
        !clearedRef.current.has(key)
      ) {
        clearedRef.current.add(key);
        deleteInvite(uid, invite.fromUid).catch(() => undefined);
      }
    }
  }, [inbox, uid, serverTime]);

  const toasts = pending
    .filter((invite) => !dismissed.includes(inviteKey(invite)))
    .slice(0, MAX_TOASTS);
  const newest = toasts[0] ? inviteKey(toasts[0]) : null;

  // A new invite: chime and focus, or a quiet announcement.
  useEffect(() => {
    if (!newest || seenRef.current.has(newest)) return;
    seenRef.current.add(newest);
    const invite = toasts[0]!;
    const stayQuiet = shouldStayQuiet();
    setQuiet((current) => ({ ...current, [newest]: stayQuiet }));
    const title = titles[invite.slug] ?? invite.slug;
    // The alert dialog announces itself; a quiet toast is announced politely instead.
    if (stayQuiet) {
      setAnnouncement(t('body', { name: invite.fromName, title }));
      return;
    }
    playInviteChime();
    const active = document.activeElement as HTMLElement | null;
    if (active && !active.closest('[data-invite-toast]')) returnFocusRef.current = active;
    // After the toast is in the DOM.
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-invite-toast="${CSS.escape(newest)}"] [data-join]`)
        ?.focus();
    });
  }, [newest, toasts, titles, t]);

  const restoreFocus = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active?.closest('[data-invite-toast]')) return;
    const back = returnFocusRef.current;
    returnFocusRef.current = null;
    if (back && back.isConnected) back.focus();
    else bellRef.current?.querySelector('summary')?.focus();
  }, []);

  function dismiss(invite: TableInvite) {
    restoreFocus();
    setDismissed((current) => [...current, inviteKey(invite)]);
  }

  function answer(invite: TableInvite, choice: 'accepted' | 'declined') {
    if (!uid) return;
    if (bellRef.current) bellRef.current.open = false;
    if (choice === 'declined') restoreFocus();
    setDismissed((current) => [...current, inviteKey(invite)]);
    answerInvite(uid, invite.fromUid, choice).catch((error) =>
      console.warn('[lobby] answer failed', error),
    );
    if (choice === 'accepted') {
      returnFocusRef.current = null;
      router.push(`/games/${invite.slug}/table/${invite.tableCode}`);
    }
  }

  const secondsLeft = (invite: TableInvite) =>
    Math.min(
      INVITE_TTL_MS / 1000,
      Math.max(0, Math.ceil((invite.createdAt + INVITE_TTL_MS - serverTime) / 1000)),
    );

  const card = (invite: TableInvite, mode: 'toast' | 'bell') => {
    const key = inviteKey(invite);
    const title = titles[invite.slug] ?? invite.slug;
    const id = `invite-${mode}-${key.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const isQuiet = mode === 'toast' && quiet[key] === true;
    return (
      <div
        key={key}
        className={styles.card}
        data-mode={mode}
        data-quiet={isQuiet || undefined}
        {...(mode === 'toast'
          ? {
              'data-invite-toast': key,
              role: isQuiet ? 'dialog' : 'alertdialog',
              'aria-modal': false,
              'aria-labelledby': `${id}-title`,
              'aria-describedby': `${id}-body`,
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  dismiss(invite);
                }
              },
            }
          : {})}
      >
        <PlayerFace
          uid={invite.fromUid}
          name={invite.fromName}
          character={invite.fromCharacter}
          size={isQuiet ? 32 : 44}
        />
        <div className={styles.text}>
          <p className={styles.title} id={`${id}-title`}>
            {t('title')}
          </p>
          <p className={styles.body} id={`${id}-body`}>
            {isQuiet
              ? t('bodyQuiet', { name: invite.fromName, title })
              : t('body', { name: invite.fromName, title })}
          </p>
          <p className={styles.meta}>
            {t('table', { code: invite.tableCode })} ·{' '}
            {t('expires', { seconds: secondsLeft(invite) })}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.join}
            data-join
            onClick={() => answer(invite, 'accepted')}
          >
            {t('join')}
          </button>
          <button
            type="button"
            className={styles.decline}
            onClick={() => answer(invite, 'declined')}
          >
            {t('decline')}
          </button>
        </div>
        {mode === 'toast' ? (
          <button
            type="button"
            className={styles.close}
            aria-label={t('close')}
            title={t('close')}
            onClick={() => dismiss(invite)}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {pending.length > 0 ? (
        <details ref={bellRef} className={popover.popover} data-popover data-invite-bell>
          <summary
            className={`${popover.trigger} ${styles.bell}`}
            aria-label={t('bellLabel', { count: pending.length })}
            title={t('bellTitle')}
          >
            <BellIcon />
            <span className={styles.badge} aria-hidden="true">
              {pending.length}
            </span>
          </summary>
          <div className={`${popover.panel} ${styles.panel}`}>
            <strong className={styles.panelTitle}>{t('bellTitle')}</strong>
            {pending.map((invite) => card(invite, 'bell'))}
          </div>
        </details>
      ) : null}
      {host
        ? createPortal(
            <>
              <p className="visually-hidden" role="status" aria-live="polite">
                {announcement}
              </p>
              {toasts.length > 0 ? (
                <section className={styles.stack} aria-label={t('regionLabel')}>
                  {toasts.map((invite) => card(invite, 'toast'))}
                </section>
              ) : null}
            </>,
            host,
          )
        : null}
    </>
  );
}
