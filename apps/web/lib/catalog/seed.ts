import type { GameManifestInput } from '@ayvago/shared';

// Seed catalog used until games are imported into Firestore (Phase 1, import wave 1).
// Entry URLs are best guesses from the repository names and must be confirmed by the owner;
// every game stays "coming_soon" until it passes the integration checklist in
// docs/plan/game-import-plan.md.

export type CatalogStatus = 'live' | 'coming_soon';

export type SeedGame = {
  slug: string;
  repo: string;
  status: CatalogStatus;
  addedAt: string;
  featured?: boolean;
  manifest: GameManifestInput;
};

const ASSETS = { icon: '/ayvago/icon-512.png', cover: '/ayvago/cover-1920x1080.jpg' };

const singlePlayerScoring = (
  label: { en: string; tr: string },
  maxPerSecond: number,
): GameManifestInput['scoring'] => ({
  metric: 'points',
  order: 'desc',
  format: 'number',
  label,
  minDurationMs: 5000,
  maxPerSecond,
  maxScore: 10_000_000,
});

const winsScoring: GameManifestInput['scoring'] = {
  metric: 'wins',
  order: 'desc',
  format: 'number',
  label: { en: 'Wins', tr: 'Galibiyet' },
  accumulate: true,
  minDurationMs: 30_000,
  maxPerSecond: 1,
  maxScore: 10_000,
};

const SCORE = { en: 'Score', tr: 'Puan' };
const DISTANCE = { en: 'Distance', tr: 'Mesafe' };

export const SEED_GAMES: SeedGame[] = [
  {
    slug: 'crystal-runner-3d',
    repo: 'selchook/crystal-runner-3d-three-js-r168',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    featured: true,
    manifest: {
      id: 'crystalrunner3d',
      title: { en: 'Crystal Runner 3D', tr: 'Crystal Runner 3D' },
      description: {
        en: 'Race through an endless, rotating crystal tunnel. Collect gems, dodge obstacles and see how far you can go.',
        tr: 'Sonsuz ve dönen bir kristal tünelde koş. Mücevherleri topla, engellerden kaç ve ne kadar uzağa gidebileceğini gör.',
      },
      category: 'retro_action',
      tags: ['3d', 'runner', 'endless'],
      entry: 'https://crystal-runner-3d-three-js-r168.vercel.app/',
      orientation: 'any',
      input: ['touch', 'keyboard'],
      players: { min: 1, max: 1 },
      scoring: singlePlayerScoring(SCORE, 500),
      ads: { rewarded: ['continue', 'double_reward'], interstitial: ['game_over'] },
      ageRating: '3+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'orb-surge',
    repo: 'selchook/orb-surge',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    featured: true,
    manifest: {
      id: 'orbsurge',
      title: { en: 'Orb Surge', tr: 'Orb Surge' },
      description: {
        en: 'Launch magnetic orbs to collect glowing energy while dodging electromagnetic hazards. Every level is generated anew.',
        tr: 'Manyetik küreleri fırlat, parlayan enerjiyi topla ve elektromanyetik tehlikelerden kaç. Her seviye yeniden üretilir.',
      },
      category: 'retro_action',
      tags: ['arcade', 'physics', 'neon'],
      entry: 'https://orb-surge.vercel.app/',
      orientation: 'any',
      input: ['touch', 'mouse'],
      players: { min: 1, max: 1 },
      scoring: singlePlayerScoring(SCORE, 250),
      ads: { rewarded: ['continue'], interstitial: ['game_over'] },
      ageRating: '3+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'pixel-cascade',
    repo: 'selchook/pixel-cascade',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    featured: true,
    manifest: {
      id: 'pixelcascade',
      title: { en: 'Pixel Cascade', tr: 'Pixel Cascade' },
      description: {
        en: 'Place retro sprite-shaped pieces and chain matching colors to trigger cascading explosions.',
        tr: 'Retro sprite şeklindeki parçaları yerleştir, aynı renkleri zincirleyip art arda patlamalar başlat.',
      },
      category: 'puzzle',
      tags: ['match', 'retro', 'blocks'],
      entry: 'https://pixel-cascade.vercel.app/',
      orientation: 'portrait',
      input: ['touch', 'mouse', 'keyboard'],
      players: { min: 1, max: 1 },
      scoring: singlePlayerScoring(SCORE, 400),
      ads: { rewarded: ['extra_moves', 'hint'], interstitial: ['level_break'] },
      ageRating: '3+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'chromashift',
    repo: 'selchook/chromashift',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    manifest: {
      id: 'chromashift',
      title: { en: 'ChromaShift', tr: 'ChromaShift' },
      description: {
        en: 'Drag, rotate and lock colored shards onto a 7×7 grid. Chain three or more of a color before the board fills up.',
        tr: 'Renkli parçaları 7×7 ızgaraya sürükle, döndür ve yerleştir. Tahta dolmadan aynı renkten en az üçünü zincirle.',
      },
      category: 'puzzle',
      tags: ['color', 'grid', 'chain'],
      entry: 'https://chromashift.vercel.app/',
      orientation: 'portrait',
      input: ['touch', 'mouse'],
      players: { min: 1, max: 1 },
      scoring: singlePlayerScoring(SCORE, 300),
      ads: { rewarded: ['continue', 'hint'], interstitial: ['game_over'] },
      ageRating: '3+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'space-defender',
    repo: 'selchook/space-defender',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    manifest: {
      id: 'spacedefender',
      title: { en: 'Space Defender', tr: 'Space Defender' },
      description: {
        en: 'Pilot a mining drone through asteroid fields, gather resources, upgrade your ship and survive the void.',
        tr: 'Bir maden dronuyla asteroit alanlarında ilerle, kaynak topla, gemini geliştir ve boşlukta hayatta kal.',
      },
      category: 'retro_action',
      tags: ['space', 'shooter', 'upgrades'],
      entry: 'https://space-defender.vercel.app/',
      orientation: 'landscape',
      input: ['touch', 'keyboard'],
      players: { min: 1, max: 1 },
      scoring: singlePlayerScoring(SCORE, 400),
      ads: { rewarded: ['extra_life'], interstitial: ['game_over'] },
      ageRating: '7+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'gyroball-infinite',
    repo: 'selchook/gyroball-infinite',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    manifest: {
      id: 'gyroballinfinite',
      title: { en: 'Gyroball Infinite', tr: 'Gyroball Infinite' },
      description: {
        en: 'Roll a metal ball through endless rotating tubes. Manage your momentum — one wrong move and you fall into the void.',
        tr: 'Metal bir topu sonsuz dönen tüplerde yuvarla. Hızını iyi yönet; tek bir hata ve boşluğa düşersin.',
      },
      category: 'casual',
      tags: ['3d', 'physics', 'endless'],
      entry: 'https://gyroball-infinite.vercel.app/',
      orientation: 'any',
      input: ['touch', 'keyboard', 'gyroscope'],
      players: { min: 1, max: 1 },
      scoring: { ...singlePlayerScoring(DISTANCE, 100), metric: 'distance' },
      ads: { rewarded: ['continue'], interstitial: ['game_over'] },
      ageRating: '3+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'number-cracker',
    repo: 'selchook/guess-number',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    manifest: {
      id: 'numbercracker',
      title: { en: 'Number Cracker', tr: 'Sayı Kırıcı' },
      description: {
        en: 'A two-player code-breaking duel: guess your opponent’s secret four-digit number using + and − hints.',
        tr: 'İki kişilik şifre kırma düellosu: + ve − ipuçlarıyla rakibinin gizli dört basamaklı sayısını bul.',
      },
      category: 'puzzle',
      tags: ['logic', 'duel', 'numbers'],
      entry: 'https://guess-number.vercel.app/',
      orientation: 'portrait',
      input: ['touch', 'keyboard'],
      players: { min: 2, max: 2 },
      scoring: winsScoring,
      ageRating: '3+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'tavla',
    repo: 'selchook/backgammon',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    manifest: {
      id: 'tavla',
      title: { en: 'Backgammon (Tavla)', tr: 'Tavla' },
      description: {
        en: 'Classic backgammon online with full rules: bar re-entry, bearing off, doubles and in-game chat.',
        tr: 'Tüm kurallarıyla çevrimiçi klasik tavla: kırık taş, taş toplama, çift zar ve oyun içi sohbet.',
      },
      category: 'board',
      tags: ['classic', 'dice', 'online'],
      entry: 'https://backgammon.vercel.app/',
      orientation: 'landscape',
      input: ['touch', 'mouse'],
      players: { min: 2, max: 2 },
      scoring: winsScoring,
      ageRating: '3+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'naval-strike',
    repo: 'selchook/battleships',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    manifest: {
      id: 'navalstrike',
      title: { en: 'Naval Strike', tr: 'Amiral Battı' },
      description: {
        en: 'Real-time multiplayer battleships: place your fleet, call your shots and sink the enemy first.',
        tr: 'Gerçek zamanlı çok oyunculu amiral battı: filonu yerleştir, atışlarını yap ve düşmanı önce batır.',
      },
      category: 'board',
      tags: ['strategy', 'naval', 'online'],
      entry: 'https://battleships.vercel.app/',
      orientation: 'any',
      input: ['touch', 'mouse'],
      players: { min: 2, max: 2 },
      scoring: winsScoring,
      ageRating: '7+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
  {
    slug: 'titos-tank',
    repo: 'selchook/tito-multiplayer',
    status: 'coming_soon',
    addedAt: '2026-10-20',
    manifest: {
      id: 'titostank',
      title: { en: 'Tito’s Tank', tr: 'Tito’nun Tankı' },
      description: {
        en: 'A turn-based artillery duel on shared terrain. Adjust your angle and power, then challenge a friend.',
        tr: 'Ortak arazide sıra tabanlı topçu düellosu. Açını ve gücünü ayarla, sonra bir arkadaşına meydan oku.',
      },
      category: 'casual',
      tags: ['artillery', 'tanks', 'duel'],
      entry: 'https://tito-multiplayer.vercel.app/',
      orientation: 'landscape',
      input: ['touch', 'mouse', 'keyboard'],
      players: { min: 2, max: 2 },
      scoring: winsScoring,
      ageRating: '7+',
      sdkVersion: 2,
      assets: ASSETS,
      version: '1.0.0',
    },
  },
];

// Local test game served by `pnpm fixture-game` (tools/fixture-game) on another origin,
// used to exercise the iframe bridge end to end. Only listed when AYVAGO_DEV_GAMES=1.
export const FIXTURE_GAME: SeedGame = {
  slug: 'bridge-fixture',
  repo: 'selchook/ayvago',
  status: 'live',
  addedAt: '2026-10-23',
  manifest: {
    id: 'bridgefixture',
    title: { en: 'Bridge Fixture', tr: 'Köprü Test Oyunu' },
    description: {
      en: 'A tiny test game that exercises the platform SDK bridge. Development builds only.',
      tr: 'Platform SDK köprüsünü deneyen küçük bir test oyunu. Sadece geliştirme ortamında görünür.',
    },
    category: 'casual',
    tags: ['test'],
    entry: 'http://localhost:4173/',
    orientation: 'any',
    input: ['touch', 'mouse', 'keyboard'],
    players: { min: 1, max: 1 },
    scoring: singlePlayerScoring(SCORE, 1000),
    ageRating: '3+',
    sdkVersion: 2,
    assets: ASSETS,
    version: '0.1.0',
  },
};
