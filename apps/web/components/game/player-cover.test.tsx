import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getAllGames, type CatalogGame } from '@/lib/catalog';
import { PlayerCover } from './player-cover';

// The player overlay's art per orientation (slices 5.24, 5.30 and 5.34) and the stage CSS that
// sizes it. Adaptive games (`any`) have landscape art: their card, fitted whole on a phone's
// portrait stage.

function gameWith(orientation: CatalogGame['manifest']['orientation']): CatalogGame {
  const base = getAllGames().find(
    (game) => game.cardUrl && game.screenshotUrl && game.manifest.orientation === 'landscape',
  );
  if (!base) throw new Error('the catalog has a landscape game with card art and a screenshot');
  return { ...base, manifest: { ...base.manifest, orientation } };
}

function render(game: CatalogGame): string {
  return renderToStaticMarkup(<PlayerCover game={game} title="Test" locale="en" />);
}

describe('PlayerCover', () => {
  it('shows a landscape game its card', () => {
    const html = render(gameWith('landscape'));
    expect(html).toContain('data-card');
    expect(html).not.toContain('adaptiveArt');
    expect(html).not.toContain('playerArt');
  });

  it('composes a portrait game art from its screenshot', () => {
    const html = render(gameWith('portrait'));
    expect(html).toContain('playerArt');
    expect(html).not.toContain('data-card');
    expect(html).not.toContain('adaptiveArt');
  });

  it('shows an adaptive game its card, with the card as the phone backdrop', () => {
    const game = gameWith('any');
    const html = render(game);
    expect(html).toContain('data-card');
    expect(html).toContain('adaptiveArt');
    expect(html).toContain(`--art:url(&quot;${game.cardUrl?.en}&quot;)`);
    expect(html).not.toContain('playerArt');
  });

  it('shows an adaptive game without card art its cover, like before', () => {
    const html = render({ ...gameWith('any'), cardUrl: null, card2xUrl: null });
    expect(html).not.toContain('adaptiveArt');
    expect(html).not.toContain('data-card');
  });
});

describe('stage CSS', () => {
  const css = readFileSync(fileURLToPath(new URL('./game.module.css', import.meta.url)), 'utf8');

  it('sizes the stage from the resolved shape only (never from the manifest value `any`)', () => {
    expect(css).toMatch(/\.stage \{[^}]*aspect-ratio: 16 \/ 9;/);
    expect(css).toMatch(/\.stage\[data-orientation='portrait'\] \{[^}]*height: min\(/);
    expect(css).not.toContain("data-orientation='any'");
  });

  it('fits an adaptive game card whole on the portrait stage only', () => {
    expect(css).toMatch(
      /\.stage\[data-orientation='portrait'\] \.adaptiveArt img\[data-card\] \{\s*object-fit: contain;/,
    );
    expect(css).toMatch(/\.stage\[data-orientation='portrait'\] \.adaptiveArt::before \{/);
    // The backdrop is never drawn (or loaded) outside the portrait stage.
    expect(css.match(/var\(--art\)/g)).toHaveLength(1);
  });
});
