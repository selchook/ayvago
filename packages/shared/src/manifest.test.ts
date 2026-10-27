import { describe, expect, it } from 'vitest';
import {
  gameCategories,
  parseGameManifest,
  pickLocalized,
  resolveAssetUrl,
  type GameManifestInput,
} from './manifest';

const orbSurge: GameManifestInput = {
  id: 'orbsurge',
  title: { tr: 'Orb Surge', en: 'Orb Surge' },
  description: { en: 'Pop the neon orbs.', tr: 'Neon küreleri patlat.' },
  category: 'arcade',
  tags: ['arcade', 'reflex'],
  entry: 'https://orb-surge.vercel.app/',
  orientation: 'any',
  input: ['touch', 'mouse', 'keyboard'],
  players: { min: 1, max: 1 },
  scoring: {
    metric: 'points',
    order: 'desc',
    format: 'number',
    label: { tr: 'Puan', en: 'Score' },
    minDurationMs: 5000,
    maxPerSecond: 250,
    maxScore: 1_000_000,
  },
  ads: { rewarded: ['continue', 'double_reward'], interstitial: ['game_over'] },
  ageRating: '3+',
  sdkVersion: 2,
  assets: { icon: '/ayvago/icon-512.png', cover: '/ayvago/cover-1920x1080.jpg' },
  version: '1.3.0',
};

function issuePaths(input: unknown): string[] {
  const result = parseGameManifest(input);
  return result.ok ? [] : result.issues.map((i) => i.path);
}

describe('parseGameManifest', () => {
  it('accepts a valid manifest and applies defaults', () => {
    const result = parseGameManifest(orbSurge);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.scoring.accumulate).toBe(false);
    expect(result.manifest.testHooks).toBe(false);
  });

  it('defaults ads to empty placement lists', () => {
    const { ads: _ads, ...rest } = orbSurge;
    const result = parseGameManifest(rest);
    expect(result.ok && result.manifest.ads).toEqual({ rewarded: [], interstitial: [] });
  });

  it('rejects ids with hyphens or uppercase letters', () => {
    expect(issuePaths({ ...orbSurge, id: 'orb-surge' })).toContain('id');
    expect(issuePaths({ ...orbSurge, id: 'OrbSurge' })).toContain('id');
  });

  it('rejects plain http entries except localhost', () => {
    expect(issuePaths({ ...orbSurge, entry: 'http://orb-surge.vercel.app/' })).toContain('entry');
    expect(parseGameManifest({ ...orbSurge, entry: 'http://localhost:5173/' }).ok).toBe(true);
  });

  it('rejects players.max below players.min', () => {
    expect(issuePaths({ ...orbSurge, players: { min: 2, max: 1 } })).toContain('players.max');
  });

  it('rejects accumulating time scores', () => {
    const scoring = { ...orbSurge.scoring, format: 'time', accumulate: true };
    expect(issuePaths({ ...orbSurge, scoring })).toContain('scoring.accumulate');
  });

  it('rejects unknown keys so typos are caught', () => {
    expect(issuePaths({ ...orbSurge, catgory: 'puzzle' })).toContain('(root)');
  });

  it('accepts extra categories only together with the primary one', () => {
    expect(parseGameManifest({ ...orbSurge, categories: ['arcade', 'action'] }).ok).toBe(true);
    expect(issuePaths({ ...orbSurge, categories: ['action', 'retro'] })).toContain('categories');
    expect(issuePaths({ ...orbSurge, categories: ['shooter'] })).toContain('categories.0');
  });

  it('accepts an optional screenshot asset', () => {
    const assets = { ...orbSurge.assets, screenshot: '/ayvago/screenshot.jpg' };
    expect(parseGameManifest({ ...orbSurge, assets }).ok).toBe(true);
    expect(
      issuePaths({ ...orbSurge, assets: { ...assets, screenshot: 'ftp://x/y.jpg' } }),
    ).toContain('assets.screenshot');
  });

  it('rejects non-snake_case ad placements', () => {
    const ads = { rewarded: ['Double Reward'], interstitial: [] };
    expect(issuePaths({ ...orbSurge, ads })).toContain('ads.rewarded.0');
  });
});

describe('gameCategories', () => {
  it('lists the primary category first, then the others once', () => {
    expect(gameCategories({ category: 'puzzle' })).toEqual(['puzzle']);
    expect(
      gameCategories({ category: 'puzzle', categories: ['casual', 'puzzle', 'retro'] }),
    ).toEqual(['puzzle', 'casual', 'retro']);
  });
});

describe('localized text', () => {
  it('requires English', () => {
    expect(issuePaths({ ...orbSurge, title: { tr: 'Orb Surge' } })).toContain('title.en');
  });

  it('rejects unsupported locales', () => {
    expect(issuePaths({ ...orbSurge, title: { en: 'Orb Surge', de: 'Orb Surge' } })).toContain(
      'title',
    );
  });

  it('falls back to English when a locale is missing', () => {
    expect(pickLocalized({ en: 'Score' }, 'tr')).toBe('Score');
    expect(pickLocalized({ en: 'Score', tr: 'Puan' }, 'tr')).toBe('Puan');
  });
});

describe('resolveAssetUrl', () => {
  it('resolves relative asset paths against the entry origin', () => {
    expect(resolveAssetUrl(orbSurge, '/ayvago/icon-512.png')).toBe(
      'https://orb-surge.vercel.app/ayvago/icon-512.png',
    );
  });
});
