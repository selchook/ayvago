# ADR 0001 — Firebase as the backend

- Status: Accepted (2026-10-16)

## Context
The platform needs a backend for authentication, the catalog, leaderboards, voting, purchase entitlements and multiplayer lobbies/signaling. The first draft proposed Supabase; the product owner chose Firebase.

## Decision
- Auth: Firebase Authentication (anonymous sign-in → upgrade to Google/Apple/email with the same uid).
- Persistent data: Cloud Firestore. Realtime data (presence, lobbies, WebRTC signaling): Realtime Database.
- Server logic: Cloud Functions (2nd gen). Secrets in Secret Manager.
- Region: `europe-west1` (the Firestore location cannot be changed later).
- Environments: separate `ayvago-dev` and `ayvago-prod` projects; Emulator Suite locally.
- Rules start as **deny-all** for every collection; each opening ships with emulator tests.

## Consequences
- Functions require the Blaze plan → budget alerts are mandatory.
- Firestore has no joins: each leaderboard's top 100 is cached in one document and ranks use `count()`.
