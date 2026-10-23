import type { TileData, TileLabels } from './game-tile';
import { GameTile } from './game-tile';
import styles from './catalog.module.css';

export function GameGrid({ tiles, labels }: { tiles: TileData[]; labels: TileLabels }) {
  return (
    <ul className={styles.grid}>
      {tiles.map((tile) => (
        <li key={tile.slug}>
          <GameTile tile={tile} labels={labels} />
        </li>
      ))}
    </ul>
  );
}
