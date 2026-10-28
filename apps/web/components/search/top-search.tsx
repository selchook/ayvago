'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { matchesSearch } from '@/lib/catalog/search';
import { SearchIcon } from '../icons';
import styles from './search.module.css';

export type SearchEntry = { slug: string; title: string; categories: string; search: string };

const MAX_SUGGESTIONS = 6;

// Top-bar search (tablet and desktop; phones use the Search tab of the bottom bar). Suggests
// games while typing; Enter opens the search page with every result. Works without JS as a
// plain GET form.
export function TopSearch({ games }: { games: SearchEntry[] }) {
  const t = useTranslations('search');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLFormElement>(null);

  const matches = useMemo(
    () => (query.trim() ? games.filter((game) => matchesSearch(game.search, query)) : []),
    [games, query],
  );

  // Closes the suggestions on a click or tap outside, and after navigating.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);
  useEffect(() => {
    setOpen(false);
    setQuery('');
  }, [pathname]);

  // The search page has its own, larger field.
  if (pathname === '/search') return null;

  function moveFocus(step: number) {
    const items = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[data-suggestion]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = index + step;
    if (next < 0) root.current?.querySelector('input')?.focus();
    else items[Math.min(next, items.length - 1)]?.focus();
  }

  return (
    <form
      ref={root}
      role="search"
      action={`/${locale}/search`}
      className={styles.top}
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
        router.push({ pathname: '/search', query: query.trim() ? { q: query.trim() } : {} });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          root.current?.querySelector('input')?.focus();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true);
          moveFocus(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(-1);
        }
      }}
    >
      <SearchIcon size={18} />
      <input
        type="search"
        name="q"
        className={styles.topInput}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('placeholder')}
        aria-label={t('label')}
        autoComplete="off"
        enterKeyHint="search"
      />
      {open && query.trim() ? (
        <div className={styles.suggestions}>
          {matches.length > 0 ? (
            <ul>
              {matches.slice(0, MAX_SUGGESTIONS).map((game) => (
                <li key={game.slug}>
                  <Link href={`/games/${game.slug}`} data-suggestion>
                    <strong>{game.title}</strong>
                    <span>{game.categories}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.none}>{t('empty', { query: query.trim() })}</p>
          )}
          <Link
            href={{ pathname: '/search', query: { q: query.trim() } }}
            className={styles.all}
            data-suggestion
          >
            {t('seeAll', { count: matches.length })}
          </Link>
        </div>
      ) : null}
    </form>
  );
}
