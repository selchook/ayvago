# ADR 0013 — Player characters

- Status: Accepted (2026-10-29)
- Related: [ADR 0002](0002-iframe-game-sdk.md) (iframe game SDK),
  [ADR 0010](0010-online-matches.md) (online matches), [ADR 0011](0011-studio-and-platform.md)
  (studio and platform), [Accounts spec](../specs/accounts.md),
  [Multiplayer spec](../specs/multiplayer.md), [Phase 5 plan](../plan/phase-5.md)

## Context
The owner asked for ten characters that players pick in their profile settings. Games that have a
hero, such as Jetpack Rush, should then play with the chosen character instead of their own. Games
run in sandboxed iframes on another origin and never read the profile, so the choice has to reach
them through the GHA protocol. The games are made in the studio (`selchook/ayvago-games`), which
builds the game side against the same contract.

## Decision
- **Ten character ids are the contract**, in display order: `alien-green` (the default),
  `alien-blue`, `alien-pink`, `alien-yellow`, `alien-beige`, `adventurer`, `explorer`, `rookie`,
  `soldier`, `zombie`. The art is Kenney CC0 (Platformer Pack Redux aliens and Platformer
  Characters 1), so the platform's previews (`apps/web/public/characters/<id>.png`) and the
  games' sprites show the same figures.
  - The list lives in `packages/shared/src/characters.ts` (`CHARACTER_IDS`,
    `DEFAULT_CHARACTER`, `isCharacterId`).
  - `firebase/firestore.rules` and `firebase/database.rules.json` repeat it.
  - Adding a character means adding it in all three places and in the studio; an id is never
    renamed or reused.
- **Protocol 2.2** (adapter 2.2.0, still `protocol: 2`; the fields are optional, so older games
  ignore them):
  - `GHA_START.config.character`: the player's chosen id. Left out when the player has not chosen
    one; games then use their own default.
  - `GHA_START.config.peerCharacter`: in an online match, the other player's chosen id (left out
    when they have none). The adapter exposes it as `multiplayer.peerCharacter` (`''` when unknown).
  - The platform only sends ids from the list, so games can map an id to a sprite without further
    checks. Games without a matching hero ignore both fields.
- **Storage:**
  - The choice is `characterId` on `users/{uid}`. The owner (guests included) may set it to one of
    the ten ids or remove it; nothing else is accepted.
  - In an online room, each seat carries its character next to its name (`hostCharacter`,
    `guestCharacter` in `rooms/{code}`). Only that seat's player may set or remove it, and only to
    one of the ten ids. The other player's game gets it from there, so neither player reads the
    other's profile.
- **All ten characters are free** and unlocked for every player, guests included.

## Consequences
- A player's choice follows the account to every device and into every game that supports it,
  solo and online, without the game knowing anything about accounts.
- At first only games whose art matches the Kenney figures use the characters. The studio adds
  support game by game; the platform needs no change for that.
- The id list is shared by three files and two repositories. The shared unit test pins the list
  and its order, and the rules tests cover every id, so a change in one place without the others
  fails CI.
- **Later:** characters could be unlocked through XP, levels or achievements (Phase 5). That would
  add an unlock list on the profile (written by Cloud Functions only) and a rules check that
  `characterId` is unlocked; the ids and the protocol stay as they are.
