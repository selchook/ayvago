import { describe, expect, it } from 'vitest';
import { parseGameManifest, resolveAssetUrl, type GameManifestInput } from './manifest';

const orbSurge: GameManifestInput = {
  id: 'orbsurge',
  title: { tr: 'Orb Surge', en: 'Orb Surge' },
  description: { tr: 'Neon küreleri patlat.' },
  category: 'retro_action',
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

  it('rejects non-snake_case ad placements', () => {
    const ads = { rewarded: ['Double Reward'], interstitial: [] };
    expect(issuePaths({ ...orbSurge, ads })).toContain('ads.rewarded.0');
  });
});

describe('resolveAssetUrl', () => {
  it('resolves relative asset paths against the entry origin', () => {
    expect(resolveAssetUrl(orbSurge, '/ayvago/icon-512.png')).toBe(
      'https://orb-surge.vercel.app/ayvago/icon-512.png',
    );
  });
});
