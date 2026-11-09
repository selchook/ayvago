import { characterPreviewPath, type CharacterId } from '@ayvago/shared';
import { Avatar } from '../account/avatar';
import styles from './lobby.module.css';

/** A player's picture in the lobby: their chosen character, or the initial-letter avatar. */
export function PlayerFace({
  uid,
  name,
  character,
  size = 40,
}: {
  uid: string;
  name: string;
  character: CharacterId | null;
  size?: number;
}) {
  if (!character) return <Avatar uid={uid} name={name} size={size} />;
  return (
    <span className={styles.face} style={{ width: size, height: size }} aria-hidden="true">
      {/* Decorative: the name is always next to it. Kenney CC0 preview, 144×176. */}
      <img src={characterPreviewPath(character)} alt="" width={144} height={176} />
    </span>
  );
}
