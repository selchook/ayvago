import styles from './account.module.css';

// Placeholder avatar until the preset avatar set ships: the name's first letter on a color
// derived from the uid, so a player always gets the same color.
function hue(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function Avatar({
  uid,
  name,
  size = 32,
}: {
  uid: string;
  name: string | null;
  size?: number;
}) {
  return (
    <span
      className={styles.avatar}
      style={{ '--avatar-hue': hue(uid), width: size, height: size } as React.CSSProperties}
      aria-hidden="true"
    >
      {name ? name.charAt(0).toLocaleUpperCase() : ''}
    </span>
  );
}
