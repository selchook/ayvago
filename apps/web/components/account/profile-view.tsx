'use client';

import {
  LOCALE_NATIVE_NAMES,
  USERNAME_COOLDOWN_DAYS,
  usernameProblem,
  type Locale,
} from '@ayvago/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import {
  AVATAR_COLORS,
  AVATAR_GLYPHS,
  avatarId,
  parseAvatarId,
  type AvatarColor,
  type AvatarPreset,
} from '@/lib/account/avatars';
import {
  changeUsername,
  deleteAccount,
  exportAccountData,
  signInWithGoogle,
  signOut,
  updateProfile,
  useAccount,
  type SignInError,
  type UsernameResult,
} from '@/lib/account/store';
import { formatScore, type ScoreFormat } from '@/lib/format';
import { useBestScores, useFavorites, useRecent } from '@/lib/library';
import { GoogleLogo } from '../icons';
import pageStyles from '../page.module.css';
import { ThemeControls } from '../theme-controls';
import { Avatar } from './avatar';
import { AvatarGlyphIcon } from './avatar-glyph';
import { CharacterPicker } from './character-picker';
import menuStyles from './account.module.css';
import styles from './profile.module.css';

export type ProfileGame = {
  slug: string;
  title: string;
  scoreFormat: ScoreFormat;
  scoreLabel: string;
};

export function ProfileView({ games }: { games: ProfileGame[] }) {
  const t = useTranslations('profile');
  const account = useAccount();
  const [deleted, setDeleted] = useState(false);

  return (
    <>
      <header className={pageStyles.header}>
        <h1>{t('title')}</h1>
      </header>
      {deleted ? (
        <p className={styles.notice} role="status">
          {t('deletedNotice')}
        </p>
      ) : null}
      {account.status === 'disabled' ? (
        <p className={styles.card}>{t('unavailable')}</p>
      ) : account.status === 'loading' || (account.status === 'signedIn' && !account.profile) ? (
        <p className={styles.card} role="status">
          {t('loading')}
        </p>
      ) : account.status === 'signedOut' ? (
        deleted ? null : (
          <SignedOut />
        )
      ) : (
        <SignedIn
          account={account}
          profile={account.profile!}
          games={games}
          onDeleted={() => setDeleted(true)}
        />
      )}
    </>
  );
}

function GoogleButton({ label }: { label: string }) {
  const t = useTranslations('account');
  const locale = useLocale() as Locale;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  return (
    <>
      <button
        type="button"
        className={menuStyles.googleButton}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await signInWithGoogle(locale));
          setBusy(false);
        }}
      >
        <GoogleLogo />
        {busy ? t('working') : label}
      </button>
      {error ? (
        <p className={menuStyles.error} role="alert">
          {t(`errors.${error.kind}`)}
          {error.code ? (
            <span className={menuStyles.errorCode}>{t('errors.code', { code: error.code })}</span>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

function SignedOut() {
  const t = useTranslations('profile');
  const ta = useTranslations('account');
  return (
    <section className={styles.card}>
      <h2>{ta('signedOutTitle')}</h2>
      <p className={styles.muted}>{ta('signedOutBody')}</p>
      <div className={styles.actions}>
        <GoogleButton label={ta('continueWithGoogle')} />
      </div>
      <p className={styles.muted}>{t('guestStart')}</p>
    </section>
  );
}

type SignedInAccount = Extract<ReturnType<typeof useAccount>, { status: 'signedIn' }>;

function SignedIn({
  account,
  profile,
  games,
  onDeleted,
}: {
  account: SignedInAccount;
  profile: NonNullable<SignedInAccount['profile']>;
  games: ProfileGame[];
  onDeleted: () => void;
}) {
  const t = useTranslations('profile');
  const ta = useTranslations('account');
  const locale = useLocale();
  const favorites = useFavorites();
  const recent = useRecent();
  const best = useBestScores();
  const bySlug = new Map(games.map((game) => [game.slug, game]));
  const bests = Object.entries(best)
    .flatMap(([slug, entry]) => {
      const game = bySlug.get(slug);
      return game ? [{ game, score: entry.score }] : [];
    })
    .sort((a, b) => a.game.title.localeCompare(b.game.title, locale));
  const memberSince = profile.createdAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(profile.createdAt)
    : null;

  return (
    <div className={styles.layout}>
      <section className={`${styles.card} ${styles.identity}`} aria-labelledby="profile-name">
        <Avatar uid={account.uid} name={profile.username} avatarId={profile.avatarId} size={88} />
        <div>
          <h2 id="profile-name" className={styles.name} data-testid="profile-name">
            {profile.username}
          </h2>
          <p className={styles.meta}>
            {account.isGuest ? (
              <span className={menuStyles.badge}>{ta('guestBadge')}</span>
            ) : (
              <span>{account.email ?? ta('signedInWithGoogle')}</span>
            )}
            {memberSince ? <span>{t('memberSince', { date: memberSince })}</span> : null}
          </p>
        </div>
        <dl className={styles.stats}>
          <div>
            <dt>{t('statFavorites')}</dt>
            <dd>{favorites.length}</dd>
          </div>
          <div>
            <dt>{t('statRecent')}</dt>
            <dd>{recent.length}</dd>
          </div>
          <div>
            <dt>{t('statBests')}</dt>
            <dd>{bests.length}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="bests-heading">
        <h2 id="bests-heading">{t('bestsTitle')}</h2>
        {bests.length === 0 ? (
          <p className={styles.muted}>{t('bestsEmpty')}</p>
        ) : (
          <ul className={styles.bests}>
            {bests.map(({ game, score }) => (
              <li key={game.slug}>
                <Link href={`/games/${game.slug}`}>{game.title}</Link>
                <span>
                  <span className={styles.muted}>{game.scoreLabel}</span>{' '}
                  <strong>{formatScore(score, game.scoreFormat, locale)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card} aria-labelledby="settings-heading">
        <h2 id="settings-heading">{t('settingsTitle')}</h2>
        <AvatarPicker current={parseAvatarId(profile.avatarId)} />
        <CharacterPicker current={profile.characterId} />
        <div className={styles.setting}>
          <h3>{t('appearance')}</h3>
          <div className={styles.themeBox}>
            <ThemeControls name="ayvago-settings" />
          </div>
        </div>
        <LanguagePicker />
        <UsernameEditor profile={profile} isGuest={account.isGuest} />
        <p className={styles.muted}>{t('settingsSync')}</p>
      </section>

      <section className={styles.card} aria-labelledby="account-heading">
        <h2 id="account-heading">{t('accountTitle')}</h2>
        {account.isGuest ? (
          <>
            <p className={styles.muted}>{ta('guestBody')}</p>
            <div className={styles.actions}>
              <GoogleButton label={ta('saveWithGoogle')} />
            </div>
          </>
        ) : (
          <>
            <p>{t('signedInAs', { email: account.email ?? '—' })}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={menuStyles.secondaryButton}
                onClick={() => signOut()}
              >
                {ta('signOut')}
              </button>
            </div>
          </>
        )}
      </section>

      <DataSection onDeleted={onDeleted} />
    </div>
  );
}

function AvatarPicker({ current }: { current: AvatarPreset | null }) {
  const t = useTranslations('profile');
  const [error, setError] = useState(false);
  const selected: AvatarPreset = current ?? { glyph: 'star', color: 'violet' };

  function choose(next: AvatarPreset) {
    setError(false);
    updateProfile({ avatarId: avatarId(next) }).catch((cause) => {
      console.error('[profile] saving avatar failed', cause);
      setError(true);
    });
  }

  return (
    <div className={styles.setting}>
      <h3>{t('avatar')}</h3>
      <fieldset className={styles.choices}>
        <legend className="visually-hidden">{t('avatarIcon')}</legend>
        {AVATAR_GLYPHS.map((glyph) => (
          <label
            key={glyph}
            className={styles.choice}
            style={{ color: `hsl(${AVATAR_COLORS[selected.color]} 65% 45%)` }}
          >
            <input
              type="radio"
              name="avatar-glyph"
              checked={current?.glyph === glyph}
              onChange={() => choose({ glyph, color: selected.color })}
              aria-label={t(`glyphs.${glyph}`)}
            />
            <span className={styles.disc}>
              <AvatarGlyphIcon glyph={glyph} size={26} />
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.choices}>
        <legend className="visually-hidden">{t('avatarColor')}</legend>
        {(Object.keys(AVATAR_COLORS) as AvatarColor[]).map((color) => (
          <label key={color} className={styles.choice}>
            <input
              type="radio"
              name="avatar-color"
              checked={current?.color === color}
              onChange={() => choose({ glyph: selected.glyph, color })}
              aria-label={t(`colors.${color}`)}
            />
            <span
              className={styles.swatch}
              style={{ background: `hsl(${AVATAR_COLORS[color]} 65% 45%)` }}
            />
          </label>
        ))}
      </fieldset>
      {error ? (
        <p className={menuStyles.error} role="alert">
          {t('saveFailed')}
        </p>
      ) : null}
    </div>
  );
}

function UsernameEditor({
  profile,
  isGuest,
}: {
  profile: NonNullable<SignedInAccount['profile']>;
  isGuest: boolean;
}) {
  const t = useTranslations('profile');
  const locale = useLocale();
  const [value, setValue] = useState(profile.username);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UsernameResult | null>(null);
  const formatDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(ms);
  const nextChange = profile.usernameChangedAt
    ? profile.usernameChangedAt + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    : null;

  if (isGuest) {
    return (
      <div className={styles.setting}>
        <h3>{t('username')}</h3>
        <p>
          <strong>{profile.username}</strong>
        </p>
        <p className={styles.muted}>{t('usernameGuest')}</p>
      </div>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const name = value.trim();
    // Same checks as the server, so most mistakes are explained without a round trip.
    const problem = usernameProblem(name);
    if (problem) {
      setResult({ ok: false, reason: problem });
      return;
    }
    setBusy(true);
    setResult(await changeUsername(name));
    setBusy(false);
  }

  return (
    <form className={styles.setting} onSubmit={save}>
      <h3>
        <label htmlFor="username-input">{t('username')}</label>
      </h3>
      <div className={styles.inline}>
        <input
          id="username-input"
          className={styles.input}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setResult(null);
          }}
          maxLength={20}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="username-help"
        />
        <button type="submit" className={menuStyles.secondaryButton} disabled={busy}>
          {busy ? t('saving') : t('save')}
        </button>
      </div>
      <p id="username-help" className={styles.muted}>
        {t('usernameRules', { days: USERNAME_COOLDOWN_DAYS })}
        {nextChange && nextChange > Date.now()
          ? ` ${t('usernameNextChange', { date: formatDate(nextChange) })}`
          : null}
      </p>
      {result?.ok ? (
        <p className={styles.success} role="status">
          {t('usernameSaved')}
        </p>
      ) : result ? (
        <p className={menuStyles.error} role="alert">
          {result.reason === 'cooldown' && result.availableAt
            ? t('usernameErrors.cooldown', { date: formatDate(result.availableAt) })
            : t(`usernameErrors.${result.reason === 'cooldown' ? 'generic' : result.reason}`)}
        </p>
      ) : null}
    </form>
  );
}

function LanguagePicker() {
  const t = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className={styles.setting}>
      <h3>{t('language')}</h3>
      <fieldset className={styles.segmented}>
        <legend className="visually-hidden">{t('language')}</legend>
        {routing.locales.map((option) => (
          <label key={option} lang={option}>
            <input
              type="radio"
              name="language"
              checked={option === locale}
              // The account copy is updated by the account menu once the page is in the new language.
              onChange={() => router.replace(pathname, { locale: option })}
            />
            <span>{LOCALE_NATIVE_NAMES[option]}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function DataSection({ onDeleted }: { onDeleted: () => void }) {
  const t = useTranslations('profile');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    try {
      const json = await exportAccountData();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ayvago-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      console.error('[profile] export failed', cause);
      setError(t('exportFailed'));
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      if ((await deleteAccount()) === 'deleted') onDeleted();
      else setConfirming(false);
    } catch (cause) {
      console.error('[profile] account deletion failed', cause);
      setError(t('deleteFailed'));
    }
    setBusy(false);
  }

  return (
    <section className={styles.card} aria-labelledby="data-heading">
      <h2 id="data-heading">{t('dataTitle')}</h2>
      <p className={styles.muted}>{t('exportBody')}</p>
      <div className={styles.actions}>
        <button type="button" className={menuStyles.secondaryButton} onClick={download}>
          {t('exportButton')}
        </button>
      </div>
      <div className={styles.danger}>
        <h3>{t('deleteTitle')}</h3>
        <p className={styles.muted}>{t('deleteBody')}</p>
        {confirming ? (
          <div className={styles.actions}>
            <button type="button" className={styles.dangerButton} onClick={remove} disabled={busy}>
              {busy ? t('deleting') : t('deleteConfirm')}
            </button>
            <button
              type="button"
              className={menuStyles.secondaryButton}
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              {t('cancel')}
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => setConfirming(true)}
            >
              {t('deleteButton')}
            </button>
          </div>
        )}
      </div>
      {error ? (
        <p className={menuStyles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
