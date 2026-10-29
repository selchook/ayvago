# Phase 5 — Owner Setup Checklist

Legend: ✅ done · ⏳ owner action · 🤖 Claude

Plan and status: [Phase 5 plan](../plan/phase-5.md).

## 5.1 Player characters
**Nothing to set up.** There are no new secrets, env vars, roles or Firebase services.

- 🤖 Merging deploys everything automatically:
  - the web app (the profile's Character section, `character` and `peerCharacter` in `GHA_START`);
  - the Firestore rules (`characterId` on the profile);
  - the Realtime Database rules (`hostCharacter` and `guestCharacter` in rooms). This uses the
    deploy role from [Phase 4 setup §2](phase-4.md#2-realtime-database-rules); if that step is
    still open, the rules run fails until the role is granted (then re-run it from Actions).
- Optional check after the deploy: open **Profile and settings** on ayvago.com, pick a character
  and reload. The choice stays marked. Games show it once the studio has added support for them,
  starting with Jetpack Rush.
