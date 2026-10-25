// Preset avatars: a glyph on a colored disc, stored on the profile as "<glyph>-<color>".
// No uploads, so there is nothing to moderate. Firestore rules accept the same id shape.

export const AVATAR_GLYPHS = [
  'star',
  'heart',
  'bolt',
  'crown',
  'rocket',
  'gamepad',
  'planet',
  'flame',
  'leaf',
  'gem',
  'moon',
  'ghost',
] as const;

// Hues for hsl(); saturation and lightness keep white glyphs readable (contrast ≥ 3:1).
export const AVATAR_COLORS = {
  violet: 265,
  blue: 220,
  teal: 180,
  green: 140,
  amber: 40,
  orange: 22,
  red: 355,
  pink: 325,
} as const;

export type AvatarGlyph = (typeof AVATAR_GLYPHS)[number];
export type AvatarColor = keyof typeof AVATAR_COLORS;
export type AvatarPreset = { glyph: AvatarGlyph; color: AvatarColor };

export function parseAvatarId(id: string | null | undefined): AvatarPreset | null {
  const [glyph, color] = (id ?? '').split('-');
  return (AVATAR_GLYPHS as readonly string[]).includes(glyph ?? '') &&
    color &&
    color in AVATAR_COLORS
    ? { glyph: glyph as AvatarGlyph, color: color as AvatarColor }
    : null;
}

export function avatarId({ glyph, color }: AvatarPreset): string {
  return `${glyph}-${color}`;
}
