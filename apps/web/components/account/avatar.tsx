import { AVATAR_COLORS, parseAvatarId } from '@/lib/account/avatars';
import { AvatarGlyphIcon } from './avatar-glyph';
import styles from './account.module.css';

// The player's chosen preset avatar, or until they pick one, the name's first letter on a
// color derived from the uid, so a player always gets the same color.
function hue(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function Avatar({
  uid,
  name,
  avatarId = null,
  size = 32,
}: {
  uid: string;
  name: string | null;
  avatarId?: string | null;
  size?: number;
}) {
  const preset = parseAvatarId(avatarId);
  const avatarHue = preset ? AVATAR_COLORS[preset.color] : hue(uid);
  return (
    <span
      className={styles.avatar}
      style={
        {
          '--avatar-hue': avatarHue,
          color: `hsl(${avatarHue} 65% 45%)`,
          width: size,
          height: size,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {preset ? (
        <AvatarGlyphIcon glyph={preset.glyph} size={Math.round(size * 0.62)} />
      ) : (
        <span className={styles.initial}>{name ? name.charAt(0).toLocaleUpperCase() : ''}</span>
      )}
    </span>
  );
}
