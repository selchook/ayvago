'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useId, useMemo, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useRecent } from '@/lib/library';
import {
  MOST_PLAYED_TABS,
  medal,
  rankMine,
  type MostPlayedTab,
  type RankedEntry,
} from '@/lib/catalog/most-played';
import { useMyStats } from '@/lib/catalog/my-stats';
import page from '../page.module.css';
import { PlayIcon } from '../icons';
import catalog from './catalog.module.css';
import { GameTile, type TileData, type TileLabels } from './game-tile';
import styles from './most-played.module.css';

const TAB_LABEL: Record<MostPlayedTab, 'tabWeek' | 'tabAll' | 'tabMine'> = {
  week: 'tabWeek',
  all: 'tabAll',
  mine: 'tabMine',
};

/** Keeps the selected tab in the address (`?tab=`) without a navigation; "week" is the default. */
function rememberTab(tab: MostPlayedTab) {
  const url = new URL(window.location.href);
  if (tab === 'week') url.searchParams.delete('tab');
  else url.searchParams.set('tab', tab);
  window.history.replaceState(window.history.state, '', url);
}

// The Most played page (slice 5.27): three tabs over ranked game grids. "This week" and "All
// time" come from the server (the public rankings document); "Yours" is read in the browser
// from the player's own stats and recently played list. Tabs follow the WAI-ARIA tabs pattern
// with automatic activation: arrow keys, Home and End move between them.
export function MostPlayedView({
  initialTab,
  tiles,
  labels,
  week,
  all,
}: {
  initialTab: MostPlayedTab;
  tiles: TileData[];
  labels: TileLabels;
  week: RankedEntry[];
  all: RankedEntry[];
}) {
  const t = useTranslations('mostPlayed');
  const tl = useTranslations('library');
  const [tab, setTab] = useState<MostPlayedTab>(initialTab);
  const tabRefs = useRef<Partial<Record<MostPlayedTab, HTMLButtonElement | null>>>({});
  const baseId = useId();
  const recent = useRecent();
  const mine = useMyStats(tab === 'mine');
  const games = useMemo(() => tiles.map(({ slug, id }) => ({ slug, id })), [tiles]);
  const mineEntries = useMemo(
    () => rankMine(mine.stats, recent, games),
    [mine.stats, recent, games],
  );

  function select(next: MostPlayedTab, focus = false) {
    setTab(next);
    rememberTab(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const index = MOST_PLAYED_TABS.indexOf(tab);
    const last = MOST_PLAYED_TABS.length - 1;
    const targets: Record<string, number> = {
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowRight: index === last ? 0 : index + 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(MOST_PLAYED_TABS[target]!, true);
  }

  const entries = tab === 'week' ? week : tab === 'all' ? all : mineEntries;
  const loading = tab === 'mine' && mine.status === 'loading' && mineEntries.length === 0;
  const empty = tab === 'week' ? t('weekEmpty') : tab === 'all' ? t('allEmpty') : t('mineEmpty');
  const note = tab === 'mine' ? tl('syncNote') : t('note');

  return (
    <>
      <div role="tablist" aria-label={t('tabsLabel')} className={styles.tabs} onKeyDown={onKeyDown}>
        {MOST_PLAYED_TABS.map((value) => (
          <button
            key={value}
            ref={(element) => {
              tabRefs.current[value] = element;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab === value ? 0 : -1}
            className={styles.tab}
            onClick={() => select(value)}
          >
            {t(TAB_LABEL[value])}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        tabIndex={0}
        className={styles.panel}
      >
        {loading ? (
          <p className={page.note}>{t('loading')}</p>
        ) : entries.length === 0 ? (
          <div className={page.empty}>
            <p>{empty}</p>
            <Link href="/" className={page.button}>
              {tl('browse')}
            </Link>
          </div>
        ) : (
          <RankedGrid entries={entries} tiles={tiles} labels={labels} />
        )}
        <p className={page.note}>{note}</p>
      </div>
    </>
  );
}

function RankedGrid({
  entries,
  tiles,
  labels,
}: {
  entries: RankedEntry[];
  tiles: TileData[];
  labels: TileLabels;
}) {
  const t = useTranslations('mostPlayed');
  const format = useFormatter();
  const bySlug = new Map(tiles.map((tile) => [tile.slug, tile]));
  return (
    <ol className={`${catalog.grid} ${styles.grid}`}>
      {entries.map(({ slug, plays, rank }) => {
        const tile = bySlug.get(slug);
        if (!tile) return null;
        return (
          <li key={slug} className={styles.item} data-medal={medal(rank)}>
            <span className={styles.rank}>
              <span className="visually-hidden">{t('rank', { rank })}</span>
              <span aria-hidden="true">{rank}</span>
            </span>
            <GameTile tile={tile} labels={labels} />
            {/* Always there, so every item of a row keeps the same height. */}
            <span className={styles.plays}>
              {plays > 0 ? (
                <>
                  <PlayIcon size={12} />
                  {t('plays', {
                    count: plays,
                    plays: format.number(plays, { notation: 'compact', maximumFractionDigits: 1 }),
                  })}
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
