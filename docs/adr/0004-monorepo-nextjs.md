# ADR 0004 — pnpm + Turborepo monorepo, Next.js (App Router)

- Status: Accepted (2026-10-16)

## Decision
- One repository: `selchook/ayvago`. pnpm workspaces + Turborepo.
- Platform app: Next.js 16 (App Router) + TypeScript on Vercel (Root Directory = `apps/web`).
- Shared code lives under `packages/*` and is consumed as TypeScript source (`transpilePackages`).
- CI (GitHub Actions): format check, typecheck, tests, build.
- Everything in the repository is written in English: code, comments, identifiers, commit messages and documentation.

## Note
The first roadmap draft said Next.js 15; 16 was the current stable release when the repository was created, so the project starts on 16.
