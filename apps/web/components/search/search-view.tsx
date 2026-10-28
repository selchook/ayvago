'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { matchesSearch } from '@/lib/catalog/search';
import { GameGrid } from '../catalog/game-grid';
import type { TileData, TileLabels } from '../catalog/game-tile';
import { SearchIcon } from '../icons';
import page from '../page.module.css';
import styles from './search.module.css';

// The search page: filters the whole catalog while the player types, like the search box of
// the Ayvago Arcade games portal. The query stays in the URL (?q=) so results can be shared.
export function SearchView({
  tiles,
  labels,
  initialQuery = '',
}: {
  tiles: TileData[];
  labels: TileLabels;
  initialQuery?: string;
}) {
  const t = useTranslations('search');
  const [query, setQuery] = useState(initialQuery);
  const results = useMemo(
    () => tiles.filter((tile) => matchesSearch(tile.search, query)),
    [tiles, query],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set('q', query.trim());
    else url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', url);
  }, [query]);

  const searching = query.trim().length > 0;
  return (
    <>
      <form role="search" className={styles.field} onSubmit={(event) => event.preventDefault()}>
        <SearchIcon size={22} />
        <input
          type="search"
          className={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('label')}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus
        />
      </form>
      <p className={page.count} aria-live="polite">
        {searching ? t('results', { count: results.length }) : t('all', { count: tiles.length })}
      </p>
      {results.length > 0 ? (
        <GameGrid tiles={results} labels={labels} />
      ) : (
        <div className={page.empty}>
          <p>{t('empty', { query: query.trim() })}</p>
        </div>
      )}
    </>
  );
}
