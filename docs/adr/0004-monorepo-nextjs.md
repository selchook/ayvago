# ADR 0004 — pnpm + Turborepo monorepo, Next.js (App Router)

- Durum: Kabul edildi (2026-10-16)

## Karar
- Tek repo: `selchook/ayvago`. pnpm workspaces + Turborepo.
- Platform uygulaması Next.js 16 (App Router) + TypeScript, Vercel'de (Root Directory = `apps/web`).
- Paylaşılan kod `packages/*` altında, TypeScript kaynağı olarak tüketilir (`transpilePackages`).
- CI (GitHub Actions): format kontrolü, typecheck, test, build.
- Kod yorumları ve commit mesajları İngilizce.

## Not
Yol haritasının ilk sürümünde Next.js 15 yazıyordu; repo kurulduğunda güncel kararlı sürüm 16 olduğu için 16 ile başlandı.
