// Player characters (docs/adr/0013-player-characters.md): the platform's list of playable
// characters. The ids are a contract with the games (selchook/ayvago-games): the platform sends
// the player's choice as GHA_START `character` (and the opponent's as `peerCharacter`), and games
// whose art matches draw it. firebase/firestore.rules and firebase/database.rules.json repeat the
// list; keep the three in sync.

/** Every character id, in display order. Art: Kenney CC0 (Platformer Pack Redux, Platformer Characters 1). */
export const CHARACTER_IDS = [
  'alien-green',
  'alien-blue',
  'alien-pink',
  'alien-yellow',
  'alien-beige',
  'adventurer',
  'explorer',
  'rookie',
  'soldier',
  'zombie',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

/** The character games use when the player has not chosen one. */
export const DEFAULT_CHARACTER: CharacterId = 'alien-green';

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}

/** Path of the character's preview image in the web app (144×176 PNG). */
export function characterPreviewPath(id: CharacterId): string {
  return `/characters/${id}.png`;
}
