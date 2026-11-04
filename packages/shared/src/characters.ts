// Player characters (docs/adr/0013-player-characters.md): the platform's list of playable
// characters. The ids are a contract with the games (selchook/ayvago-games): the platform sends
// the player's choice as GHA_START `character` (and the opponent's as `peerCharacter`), and games
// whose art matches draw it. firebase/firestore.rules and firebase/database.rules.json repeat the
// list; keep the three in sync.

/**
 * Every character id, in display order. Art: Kenney CC0 Platformer Characters 1, the figures
 * that have the poses games use (kick, hang, cheer, ...).
 */
export const CHARACTER_IDS = ['adventurer', 'explorer', 'rookie', 'soldier', 'zombie'] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

/** The character games use when the player has not chosen one. */
export const DEFAULT_CHARACTER: CharacterId = 'adventurer';

/**
 * Ids that were in the list once and were taken out (slice 5.1b, ADR 0013 amendment). Older
 * profiles and rooms may still hold one; they read as "no choice". Never reuse them.
 */
export const RETIRED_CHARACTER_IDS = [
  'alien-green',
  'alien-blue',
  'alien-pink',
  'alien-yellow',
  'alien-beige',
] as const;

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}

/**
 * A stored or received character id as the platform uses it: a listed id, or null for "not
 * chosen" (absent, malformed or retired values such as the old alien ids).
 */
export function readCharacterId(value: unknown): CharacterId | null {
  return isCharacterId(value) ? value : null;
}

/** Path of the character's preview image in the web app (144×176 PNG). */
export function characterPreviewPath(id: CharacterId): string {
  return `/characters/${id}.png`;
}
