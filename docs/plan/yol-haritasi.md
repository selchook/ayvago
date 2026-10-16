# Oyun Platformu — Analiz ve Detaylı Yol Haritası (v2: Firebase + Cloudflare TURN)

> Platform adı: **Ayvago** · Domain: **ayvago.com** ✅ (satın alındı)
> Güncelleme: 16 Ekim 2026 — veritabanı/auth **Google Firebase**, TURN sunucusu **Cloudflare Realtime TURN** olarak değiştirildi.
> Mevcut oyunların platforma alınması ayrı dokümanda: `oyun-import-plani.md`

---

## 0. Özet

Vercel'deki PWA oyunlarını tek platformda toplayan; kullanıcı hesabı, skor tablosu, oylama, 3 arayüz teması (retro / cartoon / minimal), rewarded reklam + `remove_ads` satın alma, çok oyunculu bağlantı ve ileride üçüncü taraf geliştirici başvurusu destekleyen bir web platformu.

| Katman | Seçim | Neden |
|---|---|---|
| Platform uygulaması | **Next.js 16 (App Router) + TypeScript**, Vercel | Oyunlar zaten Vercel'de; oyun sayfaları SEO için sunucuda render edilir |
| Kimlik doğrulama | **Firebase Authentication** | Anonim (misafir) giriş → `linkWithPopup` ile Google/Apple/e-posta hesabına yükseltme, veri kaybı yok |
| Ana veritabanı | **Cloud Firestore** | Profil, katalog, skor, oy, satın alma; güvenlik kuralları (Security Rules) ile istemci erişimi |
| Anlık veri | **Firebase Realtime Database** | Çevrimiçi durum (presence), lobi, eşleştirme, WebRTC sinyalleşmesi — `onDisconnect` ile otomatik temizlik |
| Sunucu mantığı | **Cloud Functions for Firebase (2nd gen)** | Skor doğrulama, oy sayaçları, ödeme webhook'ları, TURN kimlik bilgisi üretimi, zamanlanmış işler |
| Kötüye kullanım koruması | **Firebase App Check** (reCAPTCHA Enterprise) | Sadece gerçek platform istemcisinin Functions/Firestore'a erişmesi |
| Dosyalar | **Cloud Storage for Firebase** | Kapak görselleri, avatarlar, geliştirici zip'leri |
| Ayar / A-B testi | **Remote Config** | Reklam sıklığı, rewarded ödül miktarları, özellik bayrakları — deploy'suz değişiklik |
| Analitik / bildirim | **Google Analytics for Firebase**, **FCM** (web push) | Retention/gelir hunisi; "rekorun geçildi" bildirimleri |
| **TURN** | **Cloudflare Realtime TURN** | Çok oyunculu WebRTC bağlantıları NAT/firewall arkasında da çalışsın; global anycast ağı |
| Oyun entegrasyonu | **iframe + postMessage SDK v2** (eski GHA SDK'nın güvenli, geriye uyumlu hâli) | Motor bağımsız: Phaser, Three.js, React, Canvas, Unity WebGL |
| Monorepo | **pnpm + Turborepo** | Platform, SDK, temalar, Functions, kurallar tek repoda |
| Reklam | **Google H5 Games Ads** (ana), AppLixir (yedek) | Web oyunları için resmi rewarded + interstitial |
| Ödeme (web) | **Paddle veya Lemon Squeezy** (Merchant of Record), TL için **iyzico** opsiyonel | Stripe Türkiye'de kurulu şirketleri desteklemiyor; MoR KDV/vergi işini üstlenir |
| Ödeme (mağaza) | Google Play Billing / Apple IAP — **RevenueCat** (resmi Firebase eklentisi var) | Mağazada dijital ürün mağaza ödemesiyle satılmak zorunda |

**Firebase planı:** Cloud Functions için **Blaze (kullandıkça öde)** planı şart. Ücretsiz kotalar Blaze'de de geçerli; ilk gün **bütçe alarmı** (ör. 10 $ / 25 $ / 50 $) kurulacak.

**Bölge:** Firestore konumu sonradan **değiştirilemez**. Türkiye'ye gecikme ve KVKK açısından `europe-west1` (Belçika) veya `europe-west3` (Frankfurt) — Functions ve RTDB de aynı bölgeye (`europe-west1`).

---

## 1. Mevcut Durum Analizi

### 1.1 gamehub-arena'ya erişim

`gamehub-arena` platform kodu bu bulut oturumundan erişilebilir değil (yerel makinende, GitHub'da yok). Oyun tarafı sözleşmesini iki kaynaktan çıkardım:

1. `selchook/game-factory` → `src/GameFactory.jsx` içindeki "GameHub Build" ajanı (tek dosya sınıf modülü spesifikasyonu)
2. `selchook/crystal-runner-3d-three-js-r168` → `public/js/gha-game-sdk.js` (iframe SDK v1.0) ve `docs/GHA-SUBMIT.md`

> Firebase'e geçtiğimiz için gamehub-arena'nın veritabanı kodu doğrudan taşınmayacak; yine de push'larsan auth akışı, skor tablosu kuralları ve arayüz bileşenlerinden yararlanırım.

### 1.2 GameHub Arena'dan öğrendiklerimiz

**Model A — Tek dosya sınıf modülü (`eval()`):** `constructor/start/receiveMove/handleRematch/destroy/getState/loadState`, `ClassName.meta = { id, name, players, scoring: { metric, order, format, label, accumulate } }`, `GHA.registerGame()`.

**Model B — iframe + postMessage SDK v1.0:**
- Oyun → platform: `GHA_READY`, `GHA_BRIDGE_READY`, `GHA_SESSION_START`, `GHA_SCORE`, `GHA_END`, `GHA_SESSION_END`, `GHA_MOVE_OUT`, `GHA_OPEN_LEADERBOARD`
- Platform → oyun: `GHA_START {config}`, `GHA_MOVE_IN`, `GHA_PAUSE`, `GHA_RESUME`

| Konu | Karar |
|---|---|
| Model A (`eval`) | **Bırakıyoruz** — üçüncü taraf kodunu platform sayfasında çalıştırmak hesap ele geçirme riski. |
| Model B (iframe SDK) | **Temel alıyoruz**, mesaj isimleri geriye uyumlu kalacak. |
| v1 güvenlik açığı | `postMessage(..., '*')` + gelen mesajda `origin` kontrolü yok → v2'de düzeltilecek (§4). |
| Skor güvenliği | v1'de sunucu doğrulaması yok → v2'de Cloud Functions ile oturum token'ı + makullük kontrolü. |
| `GHA_MOVE_OUT / GHA_MOVE_IN` | **Koruyoruz** — çok oyunculu hamleler bu kanaldan, platformun WebRTC katmanına gider (§9). |

### 1.3 Oyun envanteri (özet — ayrıntı `oyun-import-plani.md`'de)

| Oyun | Motor | Kategori (tahmini) | Durum |
|---|---|---|---|
| crystal-runner-3d | Three.js | Retro Action | GHA SDK v1 entegre ✅ |
| orb-surge | Phaser 3 | Retro Action | CrazyGames SDK (**kaldırılacak**), **iframe engelli** |
| space-defender | TS / Canvas | Retro Action | CrazyGames SDK (**kaldırılacak**), **iframe engelli** |
| pixel-cascade | Phaser 3 | Puzzle | CrazyGames SDK (**kaldırılacak**), **iframe engelli** |
| chromashift | Phaser 3 | Casual / Puzzle | localStorage, **iframe engelli** |
| gyroball-infinite | Three.js | Casual | localStorage, **iframe engelli** |
| guess-number (Number Detective) | React | Puzzle / Multiplayer | **Ably** (2 oyunculu Bulls & Cows) |
| backgammon (Tavla) | React | Board / Multiplayer | **Ably** |
| battleships (Naval Strike) | React | Multiplayer | **Ably** (README PeerJS diyor, kod Ably kullanıyor) |
| tito-multiplayer | Next.js | Multiplayer | **Ably** (PeerJS arayüzlü sarmalayıcı) |
| PyraStackInstant | Unity | — | Sadece boş Unity şablonu (SampleScene); henüz oyun yok |

"iframe engelli": `vercel.json` içinde `X-Frame-Options: SAMEORIGIN` var; başka domain'deki platform bu oyunları gömemez. Import planında düzeltiliyor.

### 1.4 Güvenlik bulguları ⚠️

1. **Anthropic API anahtarı:** `game-factory` ve `game-factory-new` repolarında `.env` git'e commit edilmiş; `game-factory`'deki `VITE_ANTHROPIC_API_KEY` tarayıcı paketine gömülür. → Anahtarı **iptal et / yenile**, `.env`'yi repodan çıkar.
2. **Ably anahtarları açıkta:** `battleships` (**public** repo) Ably API anahtarını `src/App.jsx` içinde **düz metin olarak** barındırıyor — GitHub'da herkes görebilir, Ably panelinden **hemen iptal et**. `backgammon` (`VITE_ABLY_API_KEY`), `guess-number` (`VITE_ABLY_KEY`) ve `tito-multiplayer` (`NEXT_PUBLIC_ABLY_KEY`) da anahtarı tarayıcı paketine gömüyor; herkes bu anahtarla senin Ably kotanı kullanabilir. Bu oyunlar platformun Firebase + Cloudflare katmanına taşınınca Ably tamamen kalkacak; o zamana kadar Ably panelinde anahtar yetkisini sadece gerekli kanallarla sınırla veya token auth'a geç.

---

## 2. Hedef Mimari

```
                  ┌──────────────────────── ayvago.com (Next.js, Vercel) ─────────────────────┐
 Kullanıcı ─────► │ Katalog · Oyun sayfası · Profil · Skor tablosu · Mağaza · /admin · /dev     │
 (PWA)            │                                                                              │
                  │ GamePlayer ── iframe (sandbox) ──► oyun.vercel.app  (SDK v2)                │
                  │     ▲ postMessage (origin + source doğrulamalı)                              │
                  │ Netcode (WebRTC DataChannel) ◄──► rakibin tarayıcısı                         │
                  │     │ sinyalleşme: RTDB      │ relay gerekirse: Cloudflare TURN              │
                  │ Ad Manager (H5 Games Ads) · Entitlements · Theme Provider · App Check        │
                  └───────┬───────────────────────────────┬──────────────────────────────────────┘
                          │ Firebase Web SDK               │ firebase-admin (SSR, ISR 60 sn)
             ┌────────────▼────────────────────────────────▼───────────┐
             │ Firebase (europe-west1)                                   │      ┌───────────────────────┐
             │  Auth · Firestore · Realtime DB · Storage · Remote Config │      │ Cloudflare Realtime   │
             │  Cloud Functions ─────────── getIceServers ──────────────────────►│ TURN (kısa ömürlü     │
             │       ▲ webhook                                            │      │ ICE kimlik bilgisi)   │
             └───────┼────────────────────────────────────────────────────┘      └───────────────────────┘
                     │
        Paddle / LemonSqueezy / RevenueCat
```

### 2.1 Monorepo yapısı (GitHub: `selchook/ayvago`)

```
ayvago/
├─ apps/
│  ├─ web/                 # Next.js platform (oyuncu arayüzü + /admin + /developers)
│  └─ sdk-playground/      # Geliştiricinin oyununu sahte platformda test ettiği araç
├─ packages/
│  ├─ game-sdk/            # SDK v2 (npm + CDN'de tek .js)
│  ├─ platform-adapter/    # Oyunların kullandığı tek cephe: Ayvago içinde SDK v2, dışarıda standalone
│  ├─ netcode/             # WebRTC DataChannel + RTDB sinyalleşme + TURN ICE yönetimi
│  ├─ themes/              # retro / cartoon / minimal token'ları
│  ├─ ui/                  # Ortak React bileşenleri
│  ├─ shared/              # Firestore tipleri, zod şemaları (ayvago.json manifest dahil)
│  └─ cli/                 # `ayvago game:import` vb. yönetim komutları
├─ firebase/
│  ├─ functions/           # Cloud Functions (TypeScript)
│  ├─ firestore.rules · firestore.indexes.json
│  ├─ database.rules.json  # Realtime Database kuralları
│  ├─ storage.rules
│  └─ tests/               # Emulator Suite + @firebase/rules-unit-testing
├─ docs/                   # Geliştirici dokümanı, ADR'ler, politikalar
└─ .github/workflows/      # CI: lint, typecheck, test, kurallar testi, functions deploy
```

Kod kuralı: **tüm kod yorumları İngilizce**.

Ortamlar: `ayvago-dev` ve `ayvago-prod` iki ayrı Firebase projesi; yerelde **Firebase Emulator Suite** (Auth, Firestore, RTDB, Functions, Storage) ile çalışılır, CI'da kurallar ve Functions testleri emülatörde koşar.

### 2.2 Firestore veri modeli

Firestore'da JOIN yok; okuma maliyeti belge sayısıyla ölçülür. Bu yüzden sık okunan veriler **önceden birleştirilmiş (denormalize)** tutulur.

| Yol | İçerik | Kim yazar |
|---|---|---|
| `users/{uid}` | Herkese açık profil: `username`, `avatarId`, `theme`, `xp`, `level`, `country`, `isGuest`, `createdAt` | Sahip (kısıtlı alanlar) |
| `users/{uid}/private/account` | `birthYear`, bildirim tercihleri, consent kaydı | Sahip |
| `users/{uid}/stats/{gameId}` | `bestScore`, `plays`, `playSeconds`, `lastPlayedAt` | **Sadece Functions** |
| `users/{uid}/favorites/{gameId}` | Favori | Sahip |
| `usernames/{lowercase}` | Kullanıcı adı benzersizliği (transaction ile rezervasyon) | Functions |
| `games/{gameId}` | Katalog: `slug`, `title`, `category`, `tags`, `originUrl`, `status`, `scoring{}`, `likes`, `dislikes`, `plays`, `rating`, `editorPick`, `thumbUrl` | Admin / Functions |
| `games/{gameId}/versions/{v}` | Sürüm geçmişi, `sdkVersion`, `reviewStatus` | Admin / Functions |
| `games/{gameId}/votes/{uid}` | `value: 1 \| -1` | Sahip — kural: `stats/{gameId}.playSeconds >= 60` |
| `sessions/{sessionId}` | Oynanış oturumu: `uid`, `gameId`, `startedAt`, `endedAt`, `score`, `continues`, `flagged` | **Sadece Functions** |
| `leaderboards/{gameId}/periods/{periodKey}` | Önbelleklenmiş ilk 100 (`top: [...]`) — sayfa görüntülemesi **tek okuma** | Functions |
| `leaderboards/{gameId}/periods/{periodKey}/entries/{uid}` | Kullanıcının o dönemdeki en iyi skoru | Functions |
| `entitlements/{uid}` | `removeAds`, `premiumUntil`, `source` | **Sadece Functions** |
| `purchases/{id}`, `adRewards/{id}` | Ödeme ve rewarded ödül kayıtları | Functions |
| `wallets/{uid}` + `/tx/{id}` | Platform jetonu (Faz 4) | Functions |
| `developers/{uid}`, `submissions/{id}`, `reviews/{id}` | Geliştirici programı (Faz 5) | Sahip + Functions |
| `reports/{id}` | Şikâyetler | Herkes oluşturur, admin okur |

`periodKey`: `all`, `w-2026-42` (ISO hafta), `d-2026-10-16`. Eski günlük dönemler zamanlanmış Function ile 30 gün sonra silinir (TTL politikası da kullanılabilir).

**Kullanıcının sırası:** `entries` üzerinde `where('score', '>', myScore).count()` aggregation sorgusu (1000 indeks girdisi başına 1 okuma ücreti) → "#1.284".

**Oy sayaçları:** `votes` yazılınca tetiklenen Function `likes/dislikes/rating` alanlarını günceller. Trafik artarsa dağıtılmış sayaç (distributed counter) kalıbına geçilir.

**Admin yetkisi:** Firebase Auth **custom claims** (`admin: true`, `editor: true`, `developer: true`) — kurallarda `request.auth.token.admin == true`.

### 2.3 Realtime Database yapısı (anlık veriler)

```
presence/{uid}                         { state: 'online', gameId, lastChanged }   ← onDisconnect → offline
lobbies/{gameId}/{roomCode}            { hostUid, players{}, status, createdAt }  ← oda kodu + davet linki
matchQueue/{gameId}/{uid}              { rating, joinedAt }                       ← hızlı eşleştirme
signaling/{roomId}/{fromUid}_{toUid}   { offer, answer, candidates{} }            ← WebRTC el sıkışması
relay/{roomId}/moves/{pushId}          { from, data, ts }                         ← WebRTC başarısız olursa yedek kanal
```

RTDB kuralları: sadece odadaki oyuncular okuyup yazabilir; oda 2 saat sonra zamanlanmış Function ile silinir.

### 2.4 Cloud Functions listesi

| Function | Tür | Görev |
|---|---|---|
| `startSession` | Callable (App Check zorunlu) | Oturum belgesi + HMAC token üretir |
| `finishSession` | Callable | Skor doğrulama, `stats`, `entries`, `top` güncelleme |
| `onVoteWritten` | Firestore tetikleyici | Oy sayaçları + Bayes puanı |
| `reserveUsername` | Callable | Benzersiz kullanıcı adı, küfür filtresi |
| `getIceServers` | Callable (auth + hız sınırı) | Cloudflare'den kısa ömürlü TURN kimlik bilgisi (§9) |
| `matchmake` | RTDB tetikleyici | Kuyruktan oyuncu eşleştirip lobi açar |
| `grantAdReward` | Callable | Rewarded izleme sonrası ödül (günlük sınırla) |
| `paddleWebhook` / `lemonWebhook` | HTTPS | İmza doğrulama → `purchases` + `entitlements` |
| `revenuecatWebhook` | HTTPS (veya resmi eklenti) | Mağaza satın almaları → `entitlements` |
| `rollupLeaderboards` | Zamanlanmış (gece) | Dönem kapatma, eski dönem temizliği |
| `cleanupLobbies` | Zamanlanmış (saatlik) | Bayat oda/sinyalleşme verisi silme |
| `onUserDeleted` | Auth tetikleyici | KVKK/GDPR: kullanıcı verisini silme/anonimleştirme |
| `submissionChecks` | Firestore tetikleyici / Cloud Run job | Geliştirici gönderimi otomatik testleri (Faz 5) |

Gizli anahtarlar (Cloudflare API token, Paddle secret) **Secret Manager** üzerinden (`defineSecret`) — asla istemcide değil.

### 2.5 Next.js ↔ Firebase

- İstemci: Firebase Web SDK (modüler, tree-shake edilir). Auth durumu React context'te.
- Sunucu: katalog ve oyun sayfaları `firebase-admin` ile render, **ISR** (60 sn) → Firestore okuma maliyeti düşük, SEO tam.
- Vercel'de `FIREBASE_SERVICE_ACCOUNT` ortam değişkeni (sadece sunucu).
- Alternatif: Firebase App Hosting de Next.js çalıştırır; ama mevcut iş akışın Vercel'de olduğu için Vercel'de kalıyoruz.

---

## 3. Arayüz Temaları (retro · cartoon · minimal)

`<html data-theme="retro">`; seçim `users/{uid}.theme` ve `localStorage`'da. GHA'daki CSS değişken isimleri (`--bg`, `--bg-card`, `--accent`, `--text`, `--text-dim`, `--border`, `--radius`, `--success`) **aynen korunur**.

| Token | Retro | Cartoon | Minimal |
|---|---|---|---|
| Font | Press Start 2P / VT323 | Fredoka / Baloo 2 | Inter |
| `--radius` | 0 | 20px | 8px |
| Kenarlık | 2px, piksel gölge `4px 4px 0` | 3px koyu kontur | 1px ince |
| Palet | CRT yeşil/magenta/cyan, koyu | Doygun sarı/mavi/pembe, açık | Nötr + tek vurgu, açık & koyu mod |
| Efekt | Scanline (kapatılabilir), 8-bit UI sesleri | Spring animasyonlar, konfeti | Sade geçişler |
| Oyun kartı | Arcade kabin çerçevesi | Sticker kart | Düz görsel |

- Tema oyunlara iletilir: `GHA_START.config.theme` + `GHA_THEME_CHANGE`; uyum oyun için opsiyonel.
- Varsayılan tema ve kampanya temaları **Remote Config** ile yönetilebilir.
- Her tema WCAG AA kontrastı; `prefers-reduced-motion` desteği.

---

## 4. Oyun SDK v2 (iframe protokolü)

### 4.1 Güvenlik
- Platform: her mesajda `event.source === iframe.contentWindow` **ve** `event.origin === game.originUrl`.
- SDK: hedef origin `'*'` değil, izin listesindeki platform origin'i.
- iframe: `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`, `allow="autoplay; fullscreen; gamepad"`, top-navigation yok.
- Oyun Firebase'e **doğrudan erişmez**; tüm kullanıcı/skor/reklam işlemleri platform üzerinden. Böylece oyunlar Firebase config'i, token'ı veya TURN kimlik bilgisi görmez.

### 4.2 API

```ts
// v1-compatible
GHA.ready() · GHA.onStart(cb) · GHA.startGame() · GHA.endGame({ score, won, message })
GHA.submitScore(n) · GHA.onPause(cb) · GHA.onResume(cb) · GHA.openLeaderboard()
GHA.sendMove(data) · GHA.onMove(cb)
// new in v2
GHA.loadingProgress(0..1)
GHA.requestAd('rewarded' | 'interstitial', { placement }) : Promise<{ shown, rewarded }>
GHA.hasEntitlement('remove_ads') : Promise<boolean>
GHA.getPlayer() : Promise<{ displayName, avatarUrl, isGuest } | null>
GHA.cloud.save(key, json) · GHA.cloud.load(key)          // stored in Firestore by the platform
GHA.unlockAchievement(id)
GHA.onThemeChange(cb) · GHA.onMute(cb)
GHA.multiplayer.onPeerJoin(cb) · onPeerLeave(cb) · getRoom()
GHA.track(event, props)                                   // forwarded to Google Analytics
```

### 4.3 Skor doğrulama akışı

```
1. GHA_READY            → platform: startSession() callable → { sessionId, token }
2. GHA_END {score}      → platform origin/source doğrular
3. finishSession({ sessionId, token, score, durationMs })
4. Function kontrolleri: oturum bu uid'e ait ve açık mı · süre ≥ minDurationMs ·
   score ≤ maxPerSecond × süre · score ≤ maxScore · uid başına hız sınırı · App Check token'ı
5. Geçerse: stats + entries (all/hafta/gün) + gerekirse top[] güncellenir (tek transaction)
   Şüpheliyse: flagged=true, tabloda görünmez, /admin'de incelenir
```

İstemci tarafı oyunlarda hile tamamen engellenemez; bu katman konsoldan sahte skor gönderimini keser. İleride ilk 10 için seed + input replay doğrulaması eklenebilir.

---

## 5. Kullanıcı Sistemi

- **Misafir öncelikli:** ilk ziyarette `signInAnonymously()`; oyuncu hemen oynar, skorları kaydedilir.
- **Hesaba yükseltme:** `linkWithPopup(GoogleAuthProvider / OAuthProvider('apple.com'))` veya e-posta link → **aynı uid** korunur; skor, favori, satın alma kaybolmaz. Hesap zaten varsa birleştirme akışı (merge Function).
- **Profil:** kullanıcı adı (`reserveUsername`, küfür filtresi), hazır avatar seti, tema, istatistik, rozet, geçmiş.
- **Yaş kapısı:** doğum yılı; 13 yaş altı → kişiselleştirilmemiş reklam, satın alma kısıtlı.
- **Hesap silme / veri dışa aktarma:** `onUserDeleted` + "Verilerimi indir" (KVKK, GDPR, Google Play şartı).
- Kullanılmayan anonim hesaplar: Firebase'in otomatik temizleme ayarı (ör. 30 gün) açılır.

## 6. Skor Tablosu

- Oyun başına **Günlük / Haftalık / Tüm zamanlar**, ülke filtresi; sıralama `scoring.order` ile (süre yarışında küçük skor kazanır).
- İlk 100 tek belgeden (`top[]`) okunur; kullanıcının sırası `count()` sorgusuyla.
- Oyun sonu: "kişisel rekor!", "haftalıkta 37. oldun", FCM ile "rekorun geçildi" bildirimi (opt-in).
- Rewarded "devam et" kullanılan skorlar işaretlenir; oturum başı en fazla 1 devam.

## 7. Oylama ve Keşif

- **Beğen / beğenme**; kural: sadece o oyunu ≥ 60 sn oynamış kullanıcı (`stats.playSeconds`).
- Sıralama: Bayes ortalaması + son 7 gün oynanma (gece Function'ı `trendScore` hesaplar).
- Raflar: Editörün Seçimi, Popüler, Yeni, Retro Action / Casual / Puzzle, Devam Et, Favoriler.
- Yorumlar ilk fazda yok.

---

## 8. Gelir Modeli

### 8.1 Reklam

| Format | Nerede | Kural |
|---|---|---|
| **Rewarded** (ana) | Oyun içi "devam et", "2x ödül", "ipucu"; platformda günlük jeton, kozmetik kilit açma | Kullanıcı isteğiyle; ödül `grantAdReward` ile sunucuda verilir, günlük sınırlı |
| Interstitial | Oyunlar arası geçiş, oyun sonu → "tekrar oyna" | ≥ 3 dk aralık; `remove_ads` varsa **yok** |
| Banner | Masaüstü yan sütun | Mobilde yok; `remove_ads` varsa yok |

- Reklamı **üst sayfa (platform)** gösterir; oyun `GHA.requestAd()` ile ister.
- Sıklık sınırları, ödül miktarları **Remote Config** + A/B Testing ile optimize edilir.
- Sağlayıcı: Google H5 Games Ads (AdSense + H5 Games başvurusu, onay haftalar sürebilir → Faz 0'da başvur). Yedek: AppLixir.
- **CMP zorunlu:** AB/İngiltere için Google sertifikalı TCF v2.2 CMP; Google Analytics **Consent Mode v2** ile bağlanır. KVKK aydınlatma metni.

### 8.2 Uygulama içi satın almalar

| SKU | Tür | Önerilen fiyat | Etki |
|---|---|---|---|
| `remove_ads` | Tek seferlik | $2.99–4.99 | Interstitial + banner kalkar; rewarded isteğe bağlı kalır veya ödül doğrudan verilir |
| `premium_pass` (sonra) | Aylık | $1.99–2.99 | remove_ads + özel tema varyantları + rozet |
| Jeton paketleri (sonra) | Tüketilebilir | — | Sadece kozmetik; skora etki eden pay-to-win yok |

Akış: checkout → webhook Function → `purchases` + `entitlements/{uid}` → istemci `onSnapshot` ile anında görür. Mağaza sürümünde RevenueCat'in Firebase eklentisi aynı belgeye yazar.

---

## 9. Çok Oyunculu Katman — Cloudflare TURN + Firebase sinyalleşme

### 9.1 Neden TURN?
WebRTC ile iki tarayıcı doğrudan (P2P) bağlanır; ama simetrik NAT, mobil operatör CGNAT'ı veya kurumsal firewall arkasında doğrudan bağlantı kurulamaz. TURN sunucusu bu durumda trafiği aktarır (relay). Cloudflare'in TURN servisi anycast olduğu için kullanıcıya en yakın Cloudflare noktasından bağlanılır.

### 9.2 Akış

```
Oyuncu A (platform)                     Firebase                           Oyuncu B (platform)
  │ getIceServers() ───────────────► Function ──► Cloudflare API             │
  │ ◄── iceServers (TTL ~ oyun süresi)                                        │
  │ createOffer → signaling/{room}/A_B ──► RTDB ──► onValue ────────────────►│ (B de getIceServers)
  │ ◄──────────────────────────────── RTDB ◄── answer + ICE candidates ──────│
  │ ═══════════ RTCDataChannel (doğrudan, olmazsa turn.cloudflare.com üzerinden) ═══════════ │
  │ iframe ⇄ platform: GHA_MOVE_OUT / GHA_MOVE_IN (postMessage)                                │
```

- Bağlantıyı **platform (üst sayfa)** kurar, oyun iframe'i sadece `sendMove/onMove` görür → TURN kimlik bilgileri oyunlara sızmaz, tüm oyunlar aynı netcode'u kullanır.
- DataChannel ayarı: sıra tabanlı oyunlarda `ordered: true` (güvenilir); gerçek zamanlı aksiyon oyunlarında ikinci bir `ordered: false, maxRetransmits: 0` kanal.
- **Yedek:** WebRTC hiç kurulamazsa hamleler `relay/{roomId}/moves` üzerinden RTDB ile taşınır (sıra tabanlı oyunlar için yeterince hızlı).

### 9.3 Cloudflare kurulumu
1. Cloudflare panelinde **Realtime → TURN** altında bir TURN anahtarı oluştur (Key ID + API token).
2. Token'ı Firebase Secret Manager'a koy: `firebase functions:secrets:set CF_TURN_TOKEN`.
3. `getIceServers` Function'ı şu uca POST atar:
   `https://rtc.live.cloudflare.com/v1/turn/keys/{KEY_ID}/credentials/generate-ice-servers`
   `Authorization: Bearer <token>`, gövde `{ "ttl": 7200 }` → yanıt `iceServers` dizisi (STUN + TURN URL'leri, `username`, `credential`).
4. Dönen listeden **port 53 URL'lerini filtrele** (tarayıcılar bu portta zaman aşımına düşebiliyor).
5. Function korumaları: sadece giriş yapmış kullanıcı + App Check + kullanıcı başına dakikada N istek; TTL oyun süresine göre kısa tutulur.

> Uç adı ve TTL üst sınırı uygulama sırasında güncel Cloudflare dokümanından tekrar doğrulanacak (dokümanda eski `/credentials/generate` yolu da geçiyor).

### 9.4 Maliyet
Cloudflare Realtime (SFU + TURN ortak): **aylık ilk 1.000 GB ücretsiz**, sonrası **$0.05/GB** çıkış. Sıra tabanlı oyunlarda hamle verisi KB'lar düzeyinde olduğu için pratikte ücretsiz kotada kalır; ayrıca bağlantıların çoğu TURN'e hiç ihtiyaç duymadan doğrudan kurulur.

### 9.5 Mevcut çok oyunculu oyunlar
backgammon, battleships, guess-number ve tito-multiplayer (hepsi Ably) bu katmana taşınır → Ably bağımlılığı ve istemcideki Ably anahtarları kalkar. Ayrıntı: `oyun-import-plani.md` Dalga 3.

---

## 10. Geliştirici Programı (ileri faz)

### 10.1 Akış
```
Taslak → Gönderildi → Otomatik kontroller → Editoryal inceleme → Soft launch (%5 trafik, 7–14 gün) → Tam yayın
                          │ başarısız                 │ red / revizyon
                          └──► Rapor                  └──► Gerekçeli geri bildirim
```
Soft launch trafik oranı Remote Config ile yönetilir.

### 10.2 Kurallar
**Teknik (otomatik — Playwright + Lighthouse, Cloud Run job):** HTTPS; `frame-ancestors` platforma izin veriyor; SDK v2 el sıkışması (`GHA_READY` ≤ 10 sn) ve `GHA_END`; ilk yükleme ≤ 20 MB, toplam ≤ 100 MB; ilk oynanabilir an < 8 sn (4G); masaüstü + dokunmatik; `GHA_PAUSE`'da duraklama, mute'a uyma; konsolda kritik hata yok; dış reklam/izleyici script'i, harici yönlendirme, login duvarı yok; `ayvago.json` manifest geçerli.

**İçerik:** kumar, yetişkin içerik, nefret söylemi, telif ihlali yok; yaş derecelendirme beyanı.

**Editoryal rubrik (1–5):** özgünlük, cila, ilk 30 sn eğlencesi, kontrol hissi, kategori uyumu, performans. Eşik: ortalama ≥ 3.5, hiçbir kriter < 2.

**Hukuki:** geliştirici sözleşmesi, IP beyanı, kaldırma hakkı; gelir paylaşımı önerisi net reklam gelirinin **%50**'si (eski GHA dokümanındaki %70/30 alternatif).

### 10.3 Barındırma
Geliştirici kendi HTTPS URL'sini verir **veya** zip yükler → Cloud Storage → ayrı domain'de **Firebase Hosting ikinci site**'si; ana domain çerezlerinden izole. Başlangıçta Firebase'in ücretsiz `ayvago-play.web.app` adresi yeterli (`web.app` ayrı site sayıldığı için `ayvago.com` çerezlerine erişemez). `play.ayvago.com` gibi bir **alt alan adı bu iş için uygun değil**: aynı siteye ait sayılır ve izolasyon zayıflar. İleride markalı adres istenirse ayrı bir domain alınır (ör. `ayvagoplay.com`).

---

## 11. Fazlar ve Zaman Çizelgesi

### Faz 0 — Hazırlık (1 hafta)
- [ ] Anthropic anahtarını yenile, `.env`'leri repolardan çıkar; Ably anahtarlarını kısıtla
- [x] Platform adı **Ayvago**, domain **ayvago.com** satın alındı
- [ ] `ayvago.com` DNS'ini Vercel'e bağla (apex + `www` yönlendirmesi), Firebase Auth "authorized domains" listesine ekle
- [ ] E-posta: `ayvago.com` için SPF/DKIM/DMARC (Firebase Auth e-posta linkleri ve destek adresi için)
- [ ] AdSense site doğrulaması için `ayvago.com`'a `ads.txt` (Faz 3 öncesi)
- [ ] Oyunların production Vercel URL'leri listesi
- [x] `selchook/ayvago` monorepo iskeleti, CI, ADR 0001–0004, Firebase deny-all kuralları (GitHub repo oluşturma + ilk push bekliyor) — ayrıntı: `docs/setup/faz-0.md`
- [ ] Firebase projeleri `ayvago-dev` / `ayvago-prod` — **Blaze plan + bütçe alarmı**, bölge `europe-west1`
- [ ] Cloudflare hesabı, Realtime TURN anahtarı
- [ ] **AdSense + H5 Games Ads başvurusu**, Paddle/Lemon Squeezy satıcı başvurusu
- [ ] ADR'ler: Firebase veri modeli, iframe SDK, Cloudflare TURN, ödeme sağlayıcı

### Faz 1 — MVP Platform (3–4 hafta)
- [ ] Firestore modeli v1 + Security Rules + kurallar testleri (emülatör)
- [ ] Anonim + Google giriş, hesap yükseltme, profil, kullanıcı adı
- [ ] Tema sistemi (3 tema)
- [ ] Katalog, kategori ve oyun sayfaları (ISR + SEO + JSON-LD `VideoGame`)
- [ ] `GamePlayer`: iframe, yükleme ekranı, tam ekran, duraklat/ses, origin doğrulama
- [ ] SDK v2 çekirdeği + `platform-adapter` + sdk-playground
- [ ] **Import Dalga 1** (crystal-runner, orb-surge, pixel-cascade, chromashift)
- [ ] Platform PWA (manifest, service worker)
- **Kabul:** misafir kullanıcı tema seçip 4 oyunu oynayabiliyor, skoru profilinde görüyor.

### Faz 2 — Rekabet ve Topluluk (2–3 hafta)
- [ ] `startSession` / `finishSession` + App Check
- [ ] Skor tabloları (dönemler, `top[]` önbelleği, `count()` sırası)
- [ ] Oylama + Bayes, favoriler, "devam et" rafı
- [ ] **Import Dalga 2** (space-defender, gyroball-infinite)
- [ ] Admin paneli v1 (custom claims): oyun yönetimi, şüpheli skorlar
- **Kabul:** konsoldan gönderilen sahte skor tabloya girmiyor.

### Faz 3 — Gelir (3 hafta)
- [ ] CMP + Consent Mode v2, KVKK/GDPR metinleri
- [ ] Ad Manager (H5 Games Ads), Remote Config ile sıklık
- [ ] Rewarded yerleşimleri + `grantAdReward`
- [ ] Paddle/LemonSqueezy checkout + webhook → `entitlements`; `remove_ads`
- [ ] Google Analytics gelir hunisi (BigQuery export ileride)
- **Kabul:** `remove_ads` alan kullanıcı interstitial görmüyor; rewarded ödülü sunucu onayıyla geliyor.

### Faz 4 — Çok Oyunculu (2–3 hafta)
- [ ] `packages/netcode`: RTDB sinyalleşme + WebRTC DataChannel + RTDB relay yedeği
- [ ] `getIceServers` Function + Cloudflare TURN
- [ ] Lobi, oda kodu/davet linki, hızlı eşleştirme, presence, rövanş
- [ ] **Import Dalga 3** (backgammon, battleships, guess-number, tito) — Ably'den geçiş
- **Kabul:** iki farklı mobil operatör ağındaki oyuncular (TURN zorlanarak test) maç tamamlayabiliyor.

### Faz 5 — Bağlılık / Retention (2 hafta)
- [ ] Başarımlar, XP/seviye, rozetler
- [ ] Günlük görevler, giriş serisi
- [ ] FCM web push
- [ ] Bulut kayıt (`GHA.cloud`), jeton + kozmetik mağaza

### Faz 6 — Geliştirici Programı (4–6 hafta)
- [ ] Geliştirici hesabı (custom claim), sözleşme, `ayvago.json` doğrulayıcı
- [ ] Gönderim formu, zip → Storage → Firebase Hosting ikinci site
- [ ] Otomatik kontrol hattı (Cloud Run job: Playwright + Lighthouse)
- [ ] Editoryal kuyruk + rubrik, Remote Config ile soft launch
- [ ] Geliştirici paneli, gelir paylaşımı raporu, şikâyet/moderasyon
- [ ] Herkese açık SDK dokümantasyonu + Phaser/Three.js şablonları

### Faz 7 — Mağaza Dağıtımı (2–3 hafta)
- [ ] Android TWA (Bubblewrap) + Play Billing veya Capacitor; iOS Capacitor + StoreKit
- [ ] RevenueCat Firebase eklentisi → `entitlements`
- [ ] Mağaza sürümünde AdMob rewarded

**Toplam:** para kazanan sürüme ~9–10 hafta; çok oyunculu dahil ~12–13 hafta; geliştirici programı dahil ~18–21 hafta.

---

## 12. Kullanılacak Ajanlar / Skill'ler

| İş | Ajan / Skill |
|---|---|
| Monorepo | `developer-essentials:monorepo-architect`, `turborepo-caching` |
| Firestore/RTDB modeli + kurallar | `database-design:database-architect`, `backend-api-security:backend-security-coder` |
| Auth | `developer-essentials:auth-implementation-patterns` |
| Next.js | `frontend-mobile-development:nextjs-app-router-patterns`, `frontend-developer` |
| Temalar | `ui-design:design-system-setup`, `design-system-architect`, `accessibility-expert` |
| SDK v2, netcode | `javascript-typescript:typescript-pro` |
| Anti-cheat, postMessage, TURN güvenliği | `security-scanning:threat-modeling-expert` |
| Testler | `developer-essentials:e2e-testing-patterns`, `javascript-testing-patterns` |
| CI/CD (Vercel + firebase deploy) | `cloud-infrastructure:deployment-engineer` |
| Oyun importu (paralel, repo başına bir ajan) | `agent-teams:team-feature` |
| Faz sonu inceleme | `/code-review`, `/security-review` |

---

## 13. Başarı Metrikleri

| Metrik | Hedef (ilk 3 ay) |
|---|---|
| D1 / D7 retention | ≥ %25 / ≥ %8 |
| DAU başına oturum | ≥ 2.5 |
| Rewarded izleme oranı | ≥ %20 |
| Misafir → hesap dönüşümü | ≥ %10 |
| `remove_ads` dönüşümü | %0.5–1.5 |
| Skor tablosuna katılım | ≥ %30 |
| Multiplayer bağlantı başarı oranı | ≥ %98 (TURN dahil) |
| Firebase aylık maliyet / DAU | izlenecek, bütçe alarmlı |

---

## 14. Senden Beklenen Kararlar

1. ~~Platform adı ve domain~~ → **Ayvago / ayvago.com** ✅
2. Firestore bölgesi: `europe-west1` (önerim) mi, `europe-west3` mü? (sonradan değişmez)
3. Şirket durumu (ödeme sağlayıcı ve AdSense için).
4. Oyunların production URL'leri (import planı için).
5. `remove_ads` sahiplerinde rewarded davranışı: isteğe bağlı reklam mı, doğrudan ödül mü?
6. gamehub-arena'yı GitHub'a push'lamak ister misin (arayüz bileşenleri için)?
