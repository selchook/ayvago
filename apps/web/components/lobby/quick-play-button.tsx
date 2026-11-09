'use client';

import type { Locale } from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ensureGuest, useAccount } from '@/lib/account/store';
import { firebaseEnabled } from '@/lib/firebase/client';
import { rememberTable } from '@/lib/lobby/lobby';
import { quickPlay } from '@/lib/lobby/quick-play';
import { BoltIcon } from '../icons';

// A guest's generated name usually arrives with the profile within a moment (as on tables).
const NAME_WAIT_MS = 3000;

/**
 * "Quick play" (docs/adr/0020-quick-play-settings-host-handover.md): one tap seats the player at
 * the best open public table of the game, or opens one that starts by itself, and goes there.
 */
export function QuickPlayButton({
  gameId,
  slug,
  gamePath,
  size,
  className,
  disabled = false,
}: {
  gameId: string;
  slug: string;
  gamePath: string;
  /** Seats per table (the game's most players). */
  size: number;
  className?: string;
  disabled?: boolean;
}) {
  const t = useTranslations('lobby');
  const tOnline = useTranslations('online');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const account = useAccount();
  const [state, setState] = useState<'idle' | 'pending' | 'failed'>('idle');
  const [nameTimedOut, setNameTimedOut] = useState(false);
  const runningRef = useRef(false);

  const uid = account.status === 'signedIn' ? account.uid : null;
  const profile = account.status === 'signedIn' ? account.profile : null;
  const name = profile?.username ?? (nameTimedOut ? tOnline('defaultName') : null);
  const character = profile?.characterId ?? null;

  useEffect(() => {
    if (state !== 'pending') return;
    const timer = window.setTimeout(() => setNameTimedOut(true), NAME_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  // Runs once the player has an identity and a name (a guest account is made on the spot).
  useEffect(() => {
    if (state !== 'pending' || !uid || !name || runningRef.current) return;
    runningRef.current = true;
    quickPlay({ uid, name, character, gameId, slug, size })
      .then((code) => {
        rememberTable(gameId, code);
        router.push(`${gamePath}/table/${code}`);
      })
      .catch((error) => {
        console.warn('[lobby] quick play failed', error);
        runningRef.current = false;
        setState('failed');
      });
  }, [state, uid, name, character, gameId, slug, size, gamePath, router]);

  function start() {
    setState('pending');
    ensureGuest(locale).catch(() => setState('failed'));
  }

  const pending = state === 'pending';
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={start}
        disabled={disabled || pending || !firebaseEnabled()}
        aria-busy={pending || undefined}
        data-quick-play
      >
        <BoltIcon /> {pending ? t('quickPlaying') : t('quickPlay')}
      </button>
      {state === 'failed' ? (
        <span role="alert" data-quick-play-error>
          {t('quickPlayFailed')}
        </span>
      ) : null}
    </>
  );
}
