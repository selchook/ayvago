import { CoverArt } from '@/components/catalog/cover-art';
import type { CatalogGame } from '@/lib/catalog';
import styles from './game.module.css';

/**
 * The art behind the player's Play button (game, room and table pages).
 *
 * Landscape games show their 16:9 card art (slice 5.24), which fits the 16:9 stage with its logo.
 * A portrait game's stage is tall or square, so its card would be cropped to the middle and lose
 * the logo; there the Minimal and Cartoon themes compose the art from the in-game screenshot
 * instead (blurred backdrop, the sharp frame in the middle) and draw the game's name as a logo in
 * the game's own display font (Fredoka, or the pixel font for retro games). Every theme shows it,
 * Arcade included.
 */
export function PlayerCover({ game, title }: { game: CatalogGame; title: string }) {
  const { manifest } = game;
  const shot = game.screenshotUrl;
  const card = (
    <CoverArt
      id={manifest.id}
      title={title}
      category={manifest.category}
      size="hero"
      plain
      image={game.coverUrl}
      card={game.cardUrl}
      card2x={game.card2xUrl}
    />
  );
  if (manifest.orientation !== 'portrait' || !shot || !game.cardUrl) return card;

  const retro = (manifest.categories ?? [manifest.category]).includes('retro');
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
      <span className={styles.playerArtLogo} data-retro={retro || undefined}>
        {title}
      </span>
    </div>
  );
}
