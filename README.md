# Ayvago

Retro aksiyon, casual ve bulmaca oyunlarını tek çatı altında toplayan web oyun platformu — [ayvago.com](https://ayvago.com).

## Durum

**Faz 0 — Hazırlık.** Monorepo iskeleti, CI, Firebase güvenlik kuralı tabanı ve oyun manifest şeması hazır.
Yol haritası: [`docs/plan/yol-haritasi.md`](docs/plan/yol-haritasi.md) · Oyun import planı: [`docs/plan/oyun-import-plani.md`](docs/plan/oyun-import-plani.md) · Faz 0 kontrol listesi: [`docs/setup/faz-0.md`](docs/setup/faz-0.md)

## Yapı

```
apps/web            Next.js platform uygulaması (Vercel)
packages/shared     Ortak tipler ve zod şemaları (ayvago.json oyun manifesti)
firebase/           Firebase yapılandırması ve güvenlik kuralları
docs/               Yol haritası, ADR'ler, kurulum kontrol listeleri
```

## Geliştirme

Gereksinimler: Node 22, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm typecheck
pnpm test
pnpm build
```

Ortam değişkenleri için `apps/web/.env.example` dosyasını `apps/web/.env.local` olarak kopyalayın. Gerçek anahtarlar asla commit edilmez.

## Deploy

Vercel projesinde **Root Directory** = `apps/web`. Firebase kuralları `firebase/` klasöründen `firebase deploy --only firestore:rules,database,storage` ile yayınlanır.
