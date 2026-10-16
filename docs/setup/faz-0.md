# Faz 0 — Hazırlık Kontrol Listesi

Durum işaretleri: ✅ tamam · ⏳ senin yapman gereken · 🤖 Claude yapacak

## 1. Repo ve kod tabanı
- ✅ Platform adı **Ayvago**, domain **ayvago.com** satın alındı
- ✅ Monorepo iskeleti (pnpm + Turborepo), `apps/web` (Next.js 16), `packages/shared` (`ayvago.json` manifest şeması + testler)
- ✅ CI: format, typecheck, test, build (`.github/workflows/ci.yml`)
- ✅ Firebase yapılandırması ve **her şeyi reddeden** başlangıç kuralları (`firebase/`)
- ✅ ADR 0001–0004
- ⏳ GitHub'da boş **private** repo: `selchook/ayvago` (README/.gitignore eklemeden) + Claude GitHub App erişimi
- 🤖 Repo açılınca ilk push

## 2. Acil güvenlik (bekletmeden)
- ⏳ **Anthropic API anahtarını iptal et ve yenile** (console.anthropic.com) — `game-factory` ve `game-factory-new` repolarında `.env` commit edilmiş; `game-factory`'de `VITE_` önekiyle tarayıcıya gömülüyor
- ⏳ **Ably anahtarını iptal et** — `battleships` public repoda `src/App.jsx` içinde düz metin
- ⏳ Diğer Ably anahtarlarını kısıtla/yenile (`backgammon`, `guess-number`, `tito-multiplayer`)
- 🤖 İzin verirsen: iki game-factory reposundan `.env` dosyalarını `git rm --cached` ile çıkarıp `.gitignore`'a ekleyen PR'lar

## 3. Firebase
- ⏳ İki proje oluştur: `ayvago-dev` ve `ayvago-prod` (proje kimliği alınmışsa farklı kimlik yaz, `.firebaserc`'yi güncellerim)
- ⏳ Her iki projeyi **Blaze** planına geçir ve **bütçe alarmı** kur (öneri: 10 $ / 25 $ / 50 $)
- ⏳ Firestore'u **`europe-west1`** konumunda oluştur (Native mode) — sonradan değiştirilemez
- ⏳ Realtime Database'i `europe-west1` konumunda oluştur
- ⏳ Authentication: Anonim, Google (Apple ve e-posta linki Faz 1'de)
- ⏳ Authentication → Settings → Authorized domains: `ayvago.com`, `www.ayvago.com`
- ⏳ Bir Web uygulaması kaydet → config değerlerini Vercel ortam değişkenlerine gir (`apps/web/.env.example` listesi)
- 🤖 Faz 1'de: kurallar, emülatör testleri, Functions

## 4. Vercel ve domain
- ⏳ Vercel'de yeni proje: `selchook/ayvago` reposu, **Root Directory = `apps/web`**
- ⏳ `ayvago.com` DNS'ini Vercel'e yönlendir (apex + `www` → apex yönlendirmesi)
- ⏳ E-posta DNS kayıtları: SPF, DKIM, DMARC (Firebase Auth e-postaları ve destek adresi için)
- ⏳ Oyunların production URL'lerini listele (import planı için)

## 5. Cloudflare
- ⏳ Cloudflare hesabı → **Realtime → TURN** → TURN anahtarı oluştur
- ⏳ Key ID ve API token'ı **sohbete yapıştırma**; Faz 4'te `firebase functions:secrets:set CF_TURN_KEY_ID` ve `CF_TURN_TOKEN` ile Secret Manager'a sen girersin

## 6. Gelir başvuruları (onay süresi uzun — erken başla)
- ⏳ Google AdSense hesabı + `ayvago.com` site doğrulaması
- ⏳ **H5 Games Ads** (Ad Placement API) başvurusu
- ⏳ Paddle veya Lemon Squeezy satıcı başvurusu (Türkiye'den satıcı kabulünü başvuruda teyit et)
- ⏳ Şirket durumu kararı (şahıs / şirket) — ödeme sağlayıcı ve AdSense ödemeleri için

## 7. Açık kararlar
- ⏳ `remove_ads` sahiplerinde rewarded: isteğe bağlı reklam mı, doğrudan ödül mü?
- ⏳ gamehub-arena'yı GitHub'a push'lamak (arayüz bileşenlerinden yararlanmak için) — opsiyonel
