import { likePercent, type CatalogRankings } from '@ayvago/shared';
import { readFirebaseConfig, USE_EMULATORS } from '../firebase/config';
import type { CatalogGame } from './index';

// Server-side read of rankings/catalog (written hourly by the recomputeRankings function) through
// the public Firestore REST API, cached with ISR. Pages stay static; shelves and like percentages
// refresh within the hour. Without Firebase (local builds, previews) everything keeps seed order.

const REVALIDATE_SECONDS = 3600;

type RestValue = {
  integerValue?: string;
  doubleValue?: number;
  mapValue?: { fields?: RestFields };
};
type RestFields = Record<string, RestValue>;

const num = (value: RestValue | undefined) =>
  Number(value?.integerValue ?? value?.doubleValue ?? 0) || 0;

export function parseRankings(fields: RestFields | undefined): CatalogRankings {
  const games: CatalogRankings['games'] = {};
  for (const [gameId, value] of Object.entries(fields?.games?.mapValue?.fields ?? {})) {
    const f = value.mapValue?.fields ?? {};
    games[gameId] = {
      likes: num(f.likes),
      dislikes: num(f.dislikes),
      qualityScore: num(f.qualityScore),
      trendScore: num(f.trendScore),
    };
  }
  return { games };
}

export async function getRankings(): Promise<CatalogRankings | null> {
  const config = readFirebaseConfig();
  if (!config) return null;
  const base = USE_EMULATORS ? 'http://127.0.0.1:8080/v1' : 'https://firestore.googleapis.com/v1';
  // Public document (rules: read if true), so no key or token: works whatever the key's restrictions.
  const url = `${base}/projects/${config.projectId}/databases/(default)/documents/rankings/catalog`;
  try {
    const res = await fetch(url, {
      next: { revalidate: USE_EMULATORS ? 0 : REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return parseRankings(((await res.json()) as { fields?: RestFields }).fields);
  } catch {
    return null;
  }
}

/** Live games ordered by a ranking score, best first; unranked games keep their order at the end. */
export function rankGames(
  games: CatalogGame[],
  rankings: CatalogRankings | null,
  by: 'qualityScore' | 'trendScore',
): CatalogGame[] {
  if (!rankings) return games;
  const score = (game: CatalogGame) =>
    game.status === 'live' ? (rankings.games[game.manifest.id]?.[by] ?? 0) : -1;
  return games
    .map((game, index) => ({ game, index, score: score(game) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ game }) => game);
}

export function gameLikePercent(
  game: CatalogGame,
  rankings: CatalogRankings | null,
): number | null {
  const entry = rankings?.games[game.manifest.id];
  return entry ? likePercent(entry.likes, entry.dislikes) : null;
}
