import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllGames, type CatalogGame } from '@/lib/catalog';
import { PlayerCover } from './player-cover';

// The phone answer `PhoneCardArt` reads (after hydration in the browser; here set per test).
const device = vi.hoisted(() => ({ phone: false }));
vi.mock('@/lib/use-is-phone', () => ({ useIsPhone: () => device.phone }));

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

function render(game: CatalogGame, locale: 'en' | 'tr' = 'en'): string {
  return renderToStaticMarkup(<PlayerCover game={game} title="Test" locale={locale} />);
}

// Portrait card art (slice 5.35), per locale, on the game's own origin.
const portrait = {
  cardPortraitUrl: {
    en: 'https://games.example.com/p/card-portrait-360x640.webp',
    tr: 'https://games.example.com/p/card-portrait-tr-360x640.webp',
  },
  cardPortrait2xUrl: {
    en: 'https://games.example.com/p/card-portrait-720x1280.webp',
    tr: 'https://games.example.com/p/card-portrait-tr-720x1280.webp',
  },
};

function withPortraitCard(orientation: CatalogGame['manifest']['orientation']): CatalogGame {
  return { ...gameWith(orientation), ...portrait };
}

afterEach(() => {
  device.phone = false;
});

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

  it('shows an adaptive game its portrait card on a phone, in the player language', () => {
    device.phone = true;
    const game = withPortraitCard('any');
    const html = render(game);
    expect(html).toContain('portraitArt');
    expect(html).toContain(`src="${portrait.cardPortraitUrl.en}"`);
    // The card and its backdrop copy, with the same candidates; the 16:9 card is not rendered.
    expect(html.match(/<img/g)).toHaveLength(2);
    expect(html).toContain(
      `srcSet="${portrait.cardPortraitUrl.en} 360w, ${portrait.cardPortrait2xUrl.en} 720w"`,
    );
    expect(html).not.toContain(game.cardUrl?.en ?? 'no card');
    const tr = render(game, 'tr');
    expect(tr).toContain(`src="${portrait.cardPortraitUrl.tr}"`);
    expect(tr).toContain(`${portrait.cardPortrait2xUrl.tr} 720w`);
  });

  it('keeps the 16:9 card of an adaptive game off phones, even with a portrait card', () => {
    const game = withPortraitCard('any');
    const html = render(game);
    expect(html).toContain('adaptiveArt');
    expect(html).toContain('data-card');
    expect(html).not.toContain('portraitArt');
    expect(html).not.toContain('card-portrait');
  });

  it('keeps the phone fallback of an adaptive game without a portrait card', () => {
    device.phone = true;
    const html = render(gameWith('any'));
    expect(html).toContain('adaptiveArt');
    expect(html).not.toContain('portraitArt');
  });

  it('never shows a portrait card for fixed portrait and landscape games', () => {
    device.phone = true;
    for (const orientation of ['portrait', 'landscape'] as const) {
      const html = render(withPortraitCard(orientation));
      expect(html, orientation).not.toContain('portraitArt');
      expect(html, orientation).not.toContain('card-portrait');
    }
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

  it('fills the stage with the portrait card, fitted whole only on wide stages', () => {
    expect(css).toMatch(
      /\.overlay \.portraitArtCard \{[^}]*object-fit: cover;\s*object-position: center bottom;/,
    );
    expect(css).toMatch(
      /@container \(min-aspect-ratio: 3 \/ 4\) \{\s*\.overlay \.portraitArtCard \{\s*object-fit: contain;/,
    );
    // The backdrop is an image of its own, never a CSS background that could load on its own.
    expect(css).not.toContain('--portrait-art');
  });
});
