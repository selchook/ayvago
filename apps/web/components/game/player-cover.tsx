import type { Locale } from '@ayvago/shared';
import { CoverArt } from '@/components/catalog/cover-art';
import { gameCardArt, gameLogoUrl, type CatalogGame } from '@/lib/catalog';
import styles from './game.module.css';

/**
 * The art behind the player's Play button (game, room and table pages).
 *
 * Landscape games show their 16:9 card art (slice 5.24), which fits the 16:9 stage with its logo:
 * the card in the player's language when the game ships one (slice 5.32), else the English card.
 * A portrait game's stage is tall or square, so its card would be cropped to the middle and lose
 * the logo; there the Minimal and Cartoon themes compose the art from the in-game screenshot
 * instead (blurred backdrop, the sharp frame in the middle) with the game's own logo
 * (`assets.logo`, the locale's version or English) bottom-left. A game without a logo gets its
 * name written there in a display font (Fredoka, or the pixel font for retro games). Every theme
 * shows it, Arcade included. The art is decorative: the page names the game elsewhere.
 *
 * Adaptive games (`orientation: 'any'`, slice 5.34) have landscape art, so they show the card like
 * a landscape game. On a phone the player gives them a portrait stage, and there the card is
 * fitted whole (logo included) on a blurred copy of itself instead of being cropped. The CSS draws
 * that backdrop on the portrait stage only, so desktops and tablets never load it.
 */
export function PlayerCover({
  game,
  title,
  locale,
}: {
  game: CatalogGame;
  title: string;
  locale: Locale;
}) {
  const { manifest } = game;
  const shot = game.screenshotUrl;
  const art = gameCardArt(game, locale);
  const card = (
    <CoverArt
      id={manifest.id}
      title={title}
      category={manifest.category}
      size="hero"
      plain
      image={game.coverUrl}
      card={art.card}
      card2x={art.card2x}
    />
  );
  if (manifest.orientation === 'any' && art.card) {
    return (
      <div
        className={styles.adaptiveArt}
        style={{ '--art': `url("${art.card}")` } as React.CSSProperties}
        aria-hidden="true"
      >
        {card}
      </div>
    );
  }
  if (manifest.orientation !== 'portrait' || !shot || !art.card) return card;

  const retro = (manifest.categories ?? [manifest.category]).includes('retro');
  const logo = gameLogoUrl(game, locale);
  return (
    <div className={styles.playerArt} aria-hidden="true">
      <img className={styles.playerArtBlur} src={shot} alt="" loading="lazy" decoding="async" />
      <img
        className={styles.playerArtShot}
        data-retro={retro || undefined}
        src={shot}
        alt=""
        loading="lazy"
        decoding="async"
      />
      {logo ? (
        // Lazy like the shots above, so prefetching the page from a tile link never preloads it.
        <img
          className={styles.playerArtLogoImage}
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={styles.playerArtLogo} data-retro={retro || undefined}>
          {title}
        </span>
      )}
    </div>
  );
}
