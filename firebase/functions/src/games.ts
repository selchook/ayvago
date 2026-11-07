import { calibrationEndsAt } from '../../../packages/shared/src/leaderboard';
import { GAME_CATEGORIES } from '../../../packages/shared/src/categories';
import {
  gameCategories,
  scoringSchema,
  type GameManifest,
} from '../../../packages/shared/src/manifest';
import { FIXTURE_GAME, SEED_GAMES, type SeedGame } from '../../../packages/shared/src/seed-catalog';

// Games that accept score sessions, keyed by manifest id (also the Firestore id under
// leaderboards/). Read from the seed catalog until the catalog moves to Firestore.

export type LeaderboardGame = {
  gameId: string;
  slug: string;
  scoring: GameManifest['scoring'];
  /** Every category the game is listed under (progress: all-rounder). */
  categories: string[];
  /** Until this time the scoring limits only flag suspicious scores (docs/specs/leaderboards.md §7). */
  calibrationEndsAt: number;
};

function toGame(seed: SeedGame): LeaderboardGame {
  return {
    gameId: seed.manifest.id,
    slug: seed.slug,
    scoring: scoringSchema.parse(seed.manifest.scoring),
    categories: gameCategories(seed.manifest),
    calibrationEndsAt: calibrationEndsAt(seed.addedAt),
  };
}

let games: Map<string, LeaderboardGame> | null = null;
let categories: string[] | null = null;

function all(): Map<string, LeaderboardGame> {
  if (!games) {
    // The local fixture game only exists in the emulator, where the tests and local runs use it.
    const seeds =
      process.env.FUNCTIONS_EMULATOR === 'true' ? [FIXTURE_GAME, ...SEED_GAMES] : SEED_GAMES;
    games = new Map(
      seeds
        .filter((seed) => seed.status === 'live')
        .map((seed) => [seed.manifest.id, toGame(seed)]),
    );
  }
  return games;
}

export function leaderboardGame(gameId: string): LeaderboardGame | undefined {
  return all().get(gameId);
}

export function leaderboardGames(): LeaderboardGame[] {
  return [...all().values()];
}

/** The categories the live catalog uses: all-rounder asks for one game in each. */
export function liveCategories(): string[] {
  if (!categories) {
    const used = new Set(leaderboardGames().flatMap((game) => game.categories));
    categories = GAME_CATEGORIES.filter((category) => used.has(category));
  }
  return categories;
}
