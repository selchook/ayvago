# ADR 0002 — Games integrate through an iframe + postMessage SDK

- Status: Accepted (2026-10-16)

## Context
GameHub Arena used two models: single-file class modules loaded with `eval()`, and an iframe + postMessage SDK v1. Ayvago will later host third-party games, and the existing games use different engines (Phaser, Three.js, React, Canvas).

## Decision
- iframe model only. The `eval()` model is dropped (running foreign code in the platform page is a security risk).
- SDK v2 stays backward-compatible with the v1 message names (`GHA_READY`, `GHA_START`, `GHA_END`, `GHA_SCORE`, `GHA_MOVE_IN/OUT`…).
- The platform validates `event.source` and `event.origin` on every message; the SDK posts to the allow-listed platform origin instead of `'*'`.
- Games never access Firebase or Cloudflare directly. Scores, ads, users and multiplayer go through the platform.
- Games publish an `ayvago.json` manifest (schema in `packages/shared`).
- No CrazyGames integration; the CrazyGames SDK in existing games is removed during import.

## Consequences
- Games' Vercel headers must allow Ayvago via `frame-ancestors` (five games set `X-Frame-Options: SAMEORIGIN` and need fixing).
- Because of browser storage partitioning, the games' existing localStorage records are not carried over to the platform.
