# ADR 0005 — Internationalization with next-intl

- Status: Accepted (2026-10-16)

## Context
Ayvago targets players in Turkey and internationally. The repository itself is English-only, but the product UI must be localized. Game metadata comes from each game's `ayvago.json` manifest.

## Decision
- Library: `next-intl` (App Router and Server Components support, ICU message format, type-safe keys).
- Locales at launch: `en` (default and source of truth) and `tr`. The list lives in `packages/shared` (`SUPPORTED_LOCALES`).
- Routing: every page is under a locale prefix (`localePrefix: 'always'`): `/en/...`, `/tr/...`. The Next.js proxy redirects `/` using the `NEXT_LOCALE` cookie, then `Accept-Language`.
- SEO: canonical URL and `hreflang` alternates per locale.
- Catalogs: `apps/web/messages/{locale}.json`. Keys are type-checked against `en.json`; a test fails CI when a locale is missing a key or contains an empty string.
- User-facing strings never appear in code — always a message key.
- Game-provided text (manifest title, description, score label) is a `{ en, tr? }` map: English required, other locales fall back to English.
- The SDK passes `locale` to games in `GHA_START.config` and notifies changes; localizing in-game text is optional.
- Signed-in users' language is stored in `users/{uid}.locale` for server-side text (push notifications, emails).

## Consequences
- Adding a language = add the code to `SUPPORTED_LOCALES` + a messages file; CI enforces completeness.
- Fonts chosen for themes must cover Turkish glyphs.
- A translation management service (Crowdin, Tolgee) is reconsidered once there are three or more locales.
