import {
  categorySlug,
  parseGameManifest,
  pickLocalized,
  type GameCategory,
  type GameManifest,
  type Locale,
} from '@ayvago/shared';
import { FIXTURE_GAME, SEED_GAMES, type CatalogStatus, type SeedGame } from './seed';

// Catalog access layer. Pages only talk to these functions, so the seed data can be swapped
// for Firestore reads later without touching any page.

export type CatalogGame = {
  slug: string;
  repo: string;
  status: CatalogStatus;
  addedAt: string;
  featured: boolean;
  manifest: GameManifest;
  multiplayer: boolean;
};

function toCatalogGame(seed: SeedGame): CatalogGame {
  const parsed = parseGameManifest(seed.manifest);
  if (!parsed.ok) {
    const issues = parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new Error(`Invalid manifest for ${seed.slug}: ${issues}`);
  }
  return {
    slug: seed.slug,
    repo: seed.repo,
    status: seed.status,
    addedAt: seed.addedAt,
    featured: seed.featured ?? false,
    manifest: parsed.manifest,
    multiplayer: parsed.manifest.players.max > 1,
  };
}

function includeDevGames(): boolean {
  return process.env.AYVAGO_DEV_GAMES === '1';
}

/**
 * Local testing only: AYVAGO_DEV_ENTRY_OVERRIDES="orb-surge=http://localhost:4202/,..." points
 * games at local builds and marks them live, so integration branches can be played inside the
 * platform before they are deployed. Ignored in production builds.
 */
export function parseEntryOverrides(raw: string | undefined): Map<string, string> {
  const overrides = new Map<string, string>();
  if (!raw || (process.env.NODE_ENV === 'production' && process.env.AYVAGO_DEV_GAMES !== '1')) {
    return overrides;
  }
  for (const pair of raw.split(',')) {
    const [slug, url] = pair.split('=').map((part) => part.trim());
    if (slug && url) overrides.set(slug, url);
  }
  return overrides;
}

function applyOverride(seed: SeedGame, overrides: Map<string, string>): SeedGame {
  const entry = overrides.get(seed.slug);
  return entry ? { ...seed, status: 'live', manifest: { ...seed.manifest, entry } } : seed;
}

let cache: CatalogGame[] | null = null;

export function getAllGames(): CatalogGame[] {
  if (!cache) {
    const seeds = includeDevGames() ? [FIXTURE_GAME, ...SEED_GAMES] : SEED_GAMES;
    const overrides = parseEntryOverrides(process.env.AYVAGO_DEV_ENTRY_OVERRIDES);
    cache = seeds.map((seed) => toCatalogGame(applyOverride(seed, overrides)));
  }
  return cache;
}

export function getGameBySlug(slug: string): CatalogGame | undefined {
  return getAllGames().find((game) => game.slug === slug);
}

export function getGamesByCategory(category: GameCategory): CatalogGame[] {
  return getAllGames().filter((game) => game.manifest.category === category);
}

export function getFeaturedGames(): CatalogGame[] {
  return getAllGames().filter((game) => game.featured);
}

export function getNewestGames(): CatalogGame[] {
  return [...getAllGames()].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function getMultiplayerGames(): CatalogGame[] {
  return getAllGames().filter((game) => game.multiplayer);
}

// Related games: same category first, then the rest, excluding the game itself.
export function getRelatedGames(game: CatalogGame, limit = 6): CatalogGame[] {
  const others = getAllGames().filter((g) => g.slug !== game.slug);
  const same = others.filter((g) => g.manifest.category === game.manifest.category);
  const rest = others.filter((g) => g.manifest.category !== game.manifest.category);
  return [...same, ...rest].slice(0, limit);
}

export function gameTitle(game: CatalogGame, locale: Locale): string {
  return pickLocalized(game.manifest.title, locale);
}

export function gameDescription(game: CatalogGame, locale: Locale): string {
  return pickLocalized(game.manifest.description, locale);
}

export function gamePath(game: CatalogGame): string {
  return `/games/${game.slug}`;
}

export function categoryPath(category: GameCategory): string {
  return `/c/${categorySlug(category)}`;
}

export type { CatalogStatus };
