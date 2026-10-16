# Mevcut Oyunların Platforma Import Planı

> Bağlı doküman: `oyun-platformu-yol-haritasi.md` (v2 — Firebase + Cloudflare TURN)
> Tarih: 16 Ekim 2026

---

## 1. Amaç ve İlkeler

- Oyunlar **kendi Vercel deploy'larında kalır**; platform onları iframe ile gömer. Kaynak kodu platform reposuna kopyalanmaz.
- Her oyun **tek build** ile hem tek başına (kendi URL'sinde, PWA olarak) hem de Ayvago içinde çalışır. Bunu ortak bir `platform-adapter` sağlar.
- **CrazyGames entegrasyonu yok.** Oyunlardaki CrazyGames SDK'sı (script etiketi, `CrazyGamesSDK.ts` yardımcıları, `requestAd('midgame')` vb.) import sırasında **tamamen kaldırılır**; reklam ve yaşam döngüsü çağrıları adapter'a taşınır.
- Oyunlar Firebase'e veya Cloudflare'e **doğrudan bağlanmaz**; skor, reklam, kullanıcı, çok oyunculu bağlantı platform üzerinden geçer.
- Her oyun için iş, o oyunun reposunda `ayvago-integration` dalında bir PR olarak yapılır; Vercel preview URL'si ile test edilip birleştirilir.

---

## 2. Envanter ve Dalga Planı

| # | Oyun | Repo | Motor | Kategori | Mevcut durum | Engeller | İş | Dalga |
|---|---|---|---|---|---|---|---|---|
| 1 | Crystal Runner 3D | `crystal-runner-3d-three-js-r168` | Three.js | Retro Action | GHA SDK v1 ✅, CORP header var | — | **S** (SDK v2'ye geçiş) | 1 |
| 2 | Orb Surge | `orb-surge` | Phaser 3 (TS) | Retro Action | CrazyGames SDK → kaldırılacak | `X-Frame-Options: SAMEORIGIN` | **M** | 1 |
| 3 | Pixel Cascade | `pixel-cascade` | Phaser 3 (JS) | Puzzle | CrazyGames SDK → kaldırılacak | `X-Frame-Options` | **M** | 1 |
| 4 | ChromaShift | `chromashift` | Phaser 3 (TS) | Casual / Puzzle | localStorage | `X-Frame-Options` | **M** | 1 |
| 5 | Space Defender | `space-defender` | TS / Canvas | Retro Action | CrazyGames SDK (index.html içinde) → kaldırılacak | `X-Frame-Options` | **M** | 2 |
| 6 | Gyroball Infinite | `gyroball-infinite` | Three.js | Casual | localStorage | `X-Frame-Options`; jiroskop izni iframe'de | **M** | 2 |
| 7 | Number Detective | `guess-number` | React | Puzzle / MP | Ably (2 kişilik) | Ably → netcode | **M** | 3 |
| 8 | Tavla | `backgammon` | React | Board / MP | Ably + sohbet | Ably → netcode; sohbet moderasyonu | **L** | 3 |
| 9 | Naval Strike | `battleships` | React | MP | Ably (anahtar kodda!) | Ably → netcode | **M** | 3 |
| 10 | Tito | `tito-multiplayer` | Next.js | MP | Ably (PeerJS arayüzlü sarmalayıcı) | Ably → netcode; Next.js build | **M** | 3 |
| — | PyraStack | `PyraStackInstant` | Unity | — | Boş Unity şablonu | Oyun henüz yok | — | Kapsam dışı |

Efor: **S** ≈ yarım gün, **M** ≈ 1–2 gün, **L** ≈ 3–4 gün (Claude ile).

**Neden bu sıra?**
- **Dalga 1** (Faz 1 sonu): crystal-runner protokolü doğrular; diğer üçü üç farklı durumu (CrazyGames'ten arındırılacak Phaser TS, CrazyGames'ten arındırılacak Phaser JS, SDK'sız Phaser) temsil eder → adaptör olgunlaşır. 2 Retro Action + 2 Puzzle/Casual ile katalog dengeli açılır.
- **Dalga 2** (Faz 2): Canvas ve Three.js varyantları, jiroskop gibi özel izinler.
- **Dalga 3** (Faz 4): Firebase + Cloudflare TURN netcode hazır olunca dört çok oyunculu oyun.

---

## 3. Ortak Entegrasyon Kiti

Platform reposunda hazırlanır, her oyuna aynı şekilde uygulanır.

### 3.1 Vercel header düzeltmesi (iframe izni) — **zorunlu**

5 oyunda bulunan `X-Frame-Options: SAMEORIGIN` platformun oyunu gömmesini engelliyor. Değişiklik:

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "Content-Security-Policy",
      "value": "frame-ancestors 'self' https://ayvago.com https://*.ayvago.com http://localhost:3000" },
    { "key": "Cross-Origin-Resource-Policy", "value": "cross-origin" }
  ]
}
```

- `X-Frame-Options` satırı **silinir** (CSP `frame-ancestors` onun modern karşılığı ve izin listesi verebiliyor).
- `Cross-Origin-Opener-Policy: same-origin` iframe içinde etkisizdir, kalabilir.
- Platformun Vercel preview domain'leri için de geçici izin (`https://ayvago-*.vercel.app`).

### 3.2 `@ayvago/platform-adapter` — tek cephe

Oyun kodu sadece bu arayüzü bilir; çalışma anında iki uygulamadan birini seçer: Ayvago içinde iframe'de açıldıysa **AyvagoAdapter** (SDK v2), kendi URL'sinde açıldıysa **StandaloneAdapter** (reklamsız, localStorage rekorlu, eski davranış).

```ts
// Single facade the game talks to. Picks Ayvago or standalone at runtime.
export interface PlatformAdapter {
  readonly name: 'ayvago' | 'standalone';
  init(): Promise<void>;
  loadingProgress(progress: number): void;   // 0..1
  loadingDone(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  submitScore(score: number): void;           // mid-run checkpoint
  endGame(result: { score?: number; won?: boolean; message?: string }): void;
  requestRewarded(placement: string): Promise<boolean>;  // true = reward granted
  requestInterstitial(placement: string): Promise<void>;
  celebrate(): void;                           // platform confetti / highlight on big moments
  getBestScore(): Promise<number | null>;      // server best on Ayvago, localStorage elsewhere
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  onMute(cb: (muted: boolean) => void): void;
  onThemeChange(cb: (theme: 'retro' | 'cartoon' | 'minimal') => void): void;
}

export async function createPlatformAdapter(opts: { gameId: string }): Promise<PlatformAdapter> {
  // Embedded in Ayvago: the SDK v2 handshake succeeds within the timeout
  if (window.self !== window.top && (await detectAyvago(1500))) return new AyvagoAdapter(opts);
  return new StandaloneAdapter(opts);
}
```

**CrazyGames SDK'sının kaldırılması — eski çağrı → yeni karşılık** (orb-surge, pixel-cascade, space-defender taranarak çıkarıldı):

| Kaldırılacak CrazyGames v3 çağrısı | Yerine gelecek adapter çağrısı | Ayvago SDK v2 mesajı |
|---|---|---|
| `SDK.game.loadingStart/Stop` | `loadingProgress` / `loadingDone` | `GHA_LOADING` / `GHA_READY` |
| `SDK.game.gameplayStart/Stop` | `gameplayStart` / `gameplayStop` | `GHA_SESSION_START` / `GHA_PAUSE`'a uyum |
| `SDK.ad.requestAd('midgame')` | `requestInterstitial` | `GHA_AD_REQUEST {format:'interstitial'}` |
| `SDK.ad.requestAd('rewarded')` | `requestRewarded` | `GHA_AD_REQUEST {format:'rewarded'}` |
| `SDK.game.happytime()` | `celebrate` | (konfeti efekti, cartoon temada) |
| `SDK.game.settings` (ses vb.) | `onMute` | `GHA_MUTE` |
| — (yok) | `endGame` | `GHA_END` → skor doğrulama |

**Kaldırılacak dosya ve satırlar:**
- `index.html` içindeki `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js">` etiketi (3 oyun)
- `orb-surge/src/utils/CrazyGamesSDK.ts` ve onu çağıran `MenuScene`, `GameScene`, `GameOverScene`; `space-defender/src/managers/CrazyGamesSDK.ts` ve `space-defender/index.html` içindeki satır içi CrazyGames yardımcıları
- `pixel-cascade` sahnelerindeki (`BootScene`, `PreloadScene`, `MenuScene`, `GameOverScene`, `GameState.js`) doğrudan `window.CrazyGames` çağrıları
- `window.CrazyGames` tip tanımları (`src/types/index.ts`)
- Kontrol: import sonrası `grep -ri crazygames src index.html` boş dönmeli; harness da `sdk.crazygames.com`'a istek atılırsa testi düşürür.

**Dağıtım:** npm paketi (`@ayvago/platform-adapter`) veya bağımlılık eklemek istemeyen oyunlar için CDN'den tek dosya.

### 3.3 `ayvago.json` manifest (her oyunun `public/` klasörüne)

```json
{
  "$schema": "https://ayvago.com/schemas/manifest.v1.json",
  "id": "orbsurge",
  "title": { "tr": "Orb Surge", "en": "Orb Surge" },
  "description": { "tr": "…", "en": "…" },
  "category": "retro_action",
  "tags": ["arcade", "reflex", "neon"],
  "entry": "https://orb-surge.vercel.app/",
  "orientation": "any",
  "input": ["touch", "mouse", "keyboard"],
  "players": { "min": 1, "max": 1 },
  "scoring": {
    "metric": "points", "order": "desc", "format": "number", "label": { "tr": "Puan", "en": "Score" },
    "minDurationMs": 5000, "maxPerSecond": 250, "maxScore": 1000000
  },
  "ads": { "rewarded": ["continue", "double_reward"], "interstitial": ["game_over"] },
  "ageRating": "3+",
  "sdkVersion": 2,
  "assets": { "icon": "/ayvago/icon-512.png", "cover": "/ayvago/cover-1920x1080.jpg", "preview": "/ayvago/preview.mp4" },
  "version": "1.3.0"
}
```

Şema `packages/shared` içinde zod ile tanımlanır; hem import CLI hem ileride geliştirici gönderimleri aynı doğrulayıcıyı kullanır.

### 3.4 Motor bazlı bağlantı noktaları

| Motor | Duraklat / devam | Ses kapatma | Oyun sonu | Rewarded "devam et" |
|---|---|---|---|---|
| **Phaser 3** | `game.loop.sleep()` / `wake()` veya aktif sahnede `scene.pause()` | `game.sound.mute = muted` | GameOverScene `create()` → `adapter.endGame()` | Ölüm anında modal → `requestRewarded('continue')` → `true` ise sahneyi kaldığı yerden sürdür |
| **Three.js** | `renderer.setAnimationLoop(null)` / tekrar başlat, `clock.stop()` | `AudioListener.setMasterVolume(0)` | GameScene'deki ölüm dalı | Aynı |
| **Canvas 2D** | rAF döngüsünü durdur, `lastTime`'ı sıfırla | `AudioContext.suspend()` | Oyun sonu fonksiyonu | Aynı |
| **React** | Oyun durumuna `paused` bayrağı, zamanlayıcıları durdur | Web Audio `suspend()` | Kazanan belirlendiğinde | İpucu butonu |

**Platform overlay'leri:** Ayvago'da çalışırken oyunun kendi "Game Over / Play Again" ekranı **korunur** (oyunlar zaten cilalı); SDK'nın varsayılan overlay'i `useNativeOverlays: false` ile kapatılır. Ana menüdeki "Start" ekranı da kalır — sadece platform skor tablosu butonu eklenir (`adapter` üzerinden `openLeaderboard`).

### 3.5 Yerel rekorlar (localStorage) hakkında

Tarayıcılar artık iframe depolamasını üst siteye göre **bölümlüyor** (storage partitioning): oyuncunun `orb-surge.vercel.app`'te doğrudan oynarken kaydettiği `orbSurgeHighScore`, Ayvago içindeki iframe'den **görünmez**. Bu yüzden:
- Ayvago'da rekor kaynağı **sunucu** (`users/{uid}/stats/{gameId}`) olur; `adapter.getBestScore()` bunu döndürür.
- Eski yerel rekorlar skor tablosuna **taşınmaz** (doğrulanamazlar). Kayıp olarak görülmez: platformdaki skor tabloları sıfırdan, adil başlar.
- Standalone modda mevcut localStorage anahtarları (`orbSurgeHighScore`, `crystalRunner3D_highScore`, `gyroball-best-score`, …) aynen çalışmaya devam eder.

### 3.6 PWA / service worker uyumu

- Oyunun kendi service worker'ı iframe içinde de kaydolabilir; sorun değil, ama SDK/adapter dosyası **network-first** olmalı ki eski sürüm önbellekte takılı kalmasın.
- `start_url`, `display` gibi manifest alanları iframe içinde etkisizdir; oyunlar kendi PWA kurulumlarını korur.

---

## 4. Tek Oyun İçin Adım Adım Prosedür

Her oyun için aynı kontrol listesi (Claude bu adımları bir skill olarak otomatik uygular — §8).

1. **Dal aç:** oyun reposunda `ayvago-integration`.
2. **Header:** `vercel.json` → `X-Frame-Options` sil, `frame-ancestors` ekle (§3.1).
3. **CrazyGames'i sök, adapter'ı tak:** CrazyGames script etiketini, yardımcı dosyalarını ve tüm `window.CrazyGames` çağrılarını kaldır (§3.2 listesi); yerlerine `@ayvago/platform-adapter` çağrılarını koy.
4. **Yaşam döngüsü:** yükleme ilerlemesi, `gameplayStart/Stop`, pause/resume, mute bağlantıları (§3.4).
5. **Skor:** oyun sonunda `endGame({ score })`; ara skor gerekiyorsa `submitScore`.
6. **Reklam yerleşimleri:** §6'daki tabloya göre rewarded/interstitial noktaları.
7. **Tema (opsiyonel):** `onThemeChange` ile UI renklerini platform CSS değişkenlerine bağla.
8. **Manifest + görseller:** `public/ayvago.json`, `public/ayvago/icon-512.png`, `cover-1920x1080.jpg`, (opsiyonel) 10–15 sn `preview.mp4`.
9. **Standalone regresyon:** oyunun kendi URL'sinde eskisi gibi açılıp oynandığını doğrula.
10. **PR + Vercel preview** → platformun dev ortamında `?gameUrl=<preview>` ile test.
11. **Otomatik harness** (§7) yeşil.
12. **Import CLI** ile kataloğa `draft` olarak ekle (§5) → iç test → `live`.

**Tamamlanma tanımı (DoD):**
- [ ] Ayvago dev ortamında iframe içinde açılıyor, konsolda hata yok
- [ ] `GHA_READY` ≤ 10 sn (4G simülasyonu), yükleme çubuğu ilerliyor
- [ ] Oyun sonu skoru `finishSession`'dan geçip skor tablosunda görünüyor
- [ ] Sekme değişince duraklıyor, platform mute'una uyuyor
- [ ] Rewarded "devam et" çalışıyor; `remove_ads` kullanıcısında interstitial çıkmıyor
- [ ] Mobil (dikey + yatay) ve masaüstünde kontroller çalışıyor
- [ ] Standalone mod bozulmadı
- [ ] Kodda CrazyGames referansı kalmadı, `sdk.crazygames.com`'a istek yok
- [ ] `ayvago.json` doğrulayıcıdan geçti, görseller yüklendi

---

## 5. Import CLI (`packages/cli`)

```
pnpm ayvago game:import --manifest https://orb-surge.vercel.app/ayvago.json --env dev
```

Yaptıkları:
1. Manifesti indirir, zod şemasıyla doğrular.
2. `entry` URL'sinin header'larını kontrol eder (`frame-ancestors` platformu içeriyor mu, `X-Frame-Options` yok mu).
3. Harness'i (§7) çalıştırır; başarısızsa durur.
4. İkon/kapak/önizlemeyi indirir, boyut/oran kontrolü yapar, **Cloud Storage**'a yükler (`games/{id}/…`), WebP/AVIF varyantlarını üretir.
5. Firestore'a `games/{id}` (`status: 'draft'`) ve `games/{id}/versions/{version}` yazar (firebase-admin, servis hesabı ile).
6. Özet rapor basar.

Ek komutlar: `game:publish <id>` (draft → live, editör yetkisi), `game:update <id>` (yeni sürüm), `game:list`. Aynı işlemler `/admin` panelinde de buton olarak bulunur; CLI toplu import ve CI için.

---

## 6. Oyun Bazlı Skor ve Reklam Planı

Değerler **ilk tahmindir**; her oyun için kalibrasyon yapılır (§6.1).

| Oyun | Skor metriği | Sıra | Rewarded yerleşimleri | Interstitial |
|---|---|---|---|---|
| Crystal Runner 3D | Puan / mesafe | desc | Ölünce "devam et" (1×), sonuçta "2× kristal" | Oyun sonu → tekrar oyna |
| Orb Surge | Puan | desc | "Devam et", başlangıçta "kalkan ile başla" | Oyun sonu |
| Pixel Cascade | Puan | desc | "Ekstra hamle / karıştır", "ipucu" | Seviye geçişlerinde (3 seviyede bir) |
| ChromaShift | Puan | desc | "Devam et", "ipucu" | Oyun sonu |
| Space Defender | Puan | desc | "Ekstra can", "güç-up ile başla" | Dalga geçişi / oyun sonu |
| Gyroball Infinite | Mesafe | desc | "Devam et" | Oyun sonu |
| Number Detective | Kazanma sayısı | desc (accumulate) | "İpucu: bir rakamı göster" (sadece tek kişilik antrenman modunda) | Maç arası |
| Tavla | Kazanma sayısı / ELO | desc | — (rekabet adaleti) | Maç arası |
| Naval Strike | Kazanma sayısı | desc | — | Maç arası |
| Tito | Kazanma sayısı | desc | — | Maç arası |

Çok oyunculu maçlarda oyun içi rewarded **yok** (rakibe karşı avantaj olur); reklam sadece maçlar arasında.

### 6.1 Skor sınırlarının kalibrasyonu
1. Dalga oyunları önce `draft` modunda iç testte oynanır; `sessions` kayıtlarında `score` ve `durationMs` toplanır.
2. Her oyun için `score / saniye` dağılımının %99.9'luk değeri × 1.5 → `maxPerSecond`; en kısa gerçekçi oyun süresi → `minDurationMs`.
3. İlk 2 hafta canlıda limitler **sadece işaretler** (flag), engellemez; yanlış pozitif oranı görülünce sıkılaştırılır.
4. Limitler `games/{id}.scoring` alanında tutulur; deploy'suz güncellenir.

---

## 7. Otomatik Test Harness'i (Playwright)

`apps/sdk-playground` içinde, hem import CLI'ın hem CI'ın çağırdığı test:

1. Gerçek platform sayfasını taklit eden host sayfasında oyunu iframe'e yükler (farklı origin).
2. Header kontrolü: iframe gerçekten yüklenebildi mi (frame-ancestors).
3. `GHA_READY` mesajını bekler (zaman aşımı 10 sn, 4G throttling ile).
4. `GHA_START` gönderir; ekran görüntüsü alır (boş/siyah ekran tespiti).
5. Sahte girdi (tıklama/tuş) gönderir, 15 sn oynatır; `GHA_PAUSE` → kare değişmiyor mu, `GHA_RESUME` → devam ediyor mu.
6. Konsol hatalarını ve başarısız ağ isteklerini toplar.
7. Aktarılan toplam bayt (ilk yükleme) ölçer.
8. Yasaklı istekleri arar (bilinmeyen reklam/izleme domain'leri).
9. Mobil viewport (390×844) ve masaüstü (1280×800) için tekrarlar.
10. JSON + HTML rapor üretir.

Oyun sonu tetiklemek her oyunda farklı olduğundan, manifestte opsiyonel `testHooks` (ör. `?ayvagoTest=endgame` parametresi ile 3 sn sonra oyunu bitir) desteklenir; sadece test ortamında aktif.

---

## 8. Claude ile Otomasyon

- Platform reposuna `.claude/skills/integrate-game/SKILL.md` eklenir: §4'teki 12 adımı, motor bazlı kalıpları (§3.4) ve DoD'yi içerir. Komut: `/integrate-game selchook/orb-surge`.
- Her oyun **ayrı repo** olduğu için dosya çakışması yok → `agent-teams:team-feature` ile dalga içindeki oyunlar **paralel** entegre edilir (her oyuna bir `team-implementer` ajanı, sonuçta bir `team-reviewer`).
- Her PR'da `/code-review` ve harness raporu PR açıklamasına eklenir.

---

## 9. Dalga 3 — Çok Oyunculu Oyunların Taşınması

Dört oyun da Ably kullanıyor ve tito/backgammon zaten "PeerJS DataConnection arayüzlü" bir sarmalayıcıya sahip → geçiş, bu sarmalayıcının altını değiştirmek kadar sınırlı tutulabilir.

| Adım | Ayrıntı |
|---|---|
| 1. Ortak arayüz | `adapter.multiplayer`: `createRoom()`, `joinRoom(code)`, `send(data)`, `onMessage(cb)`, `onPeerJoin/Leave(cb)`, `getRole()` (host/guest) |
| 2. Ayvago uygulaması | Platformun `netcode` paketine bağlanır: RTDB lobi + sinyalleşme, WebRTC DataChannel, **Cloudflare TURN** (`getIceServers`), RTDB relay yedeği. Oyun sadece `GHA_MOVE_OUT/IN` görür. |
| 3. Standalone uygulaması | Ably yerine aynı Firebase projesinin **misafir** akışı (anonim auth + RTDB) — böylece oyunların kendi URL'lerinde de Ably'ye gerek kalmaz. Alternatif: standalone'da çok oyunculu sadece Ayvago'ya yönlendirir. |
| 4. Oda kodu / davet | Mevcut `?room=XXXXXX` derin linkleri Ayvago'da `ayvago.com/play/backgammon?room=XXXXXX` biçimine eşlenir; WhatsApp paylaşımı korunur. |
| 5. Durum senkronu | Tavla gibi tam durum gönderen oyunlarda (`publish(eventName, { state })`) host otoriter kalır; yeniden bağlanmada son durum RTDB'den okunur. |
| 6. Sohbet (Tavla) | Platform sohbet bileşeni + küfür filtresi + şikâyet; çocuk hesaplarında kapalı. |
| 7. Ably kaldırma | Paket ve anahtar referansları silinir; Ably panelinde tüm anahtarlar iptal edilir. |
| 8. Test | TURN zorlanarak (`iceTransportPolicy: 'relay'`) iki farklı ağda maç; bağlantı kopması/yeniden bağlanma; mobil arka plana alma. |

Skor: kazanma sayısı (`accumulate: true`) ve Tavla için ileride ELO; sonuç **iki tarafın raporu eşleşirse** sayılır, uyuşmazlıkta maç işaretlenir.

---

## 10. Takvim

| Zaman (yol haritası fazına göre) | İş |
|---|---|
| Faz 1, 2. hafta | SDK v2 + `platform-adapter` + harness + `ayvago.json` şeması + import CLI iskeleti |
| Faz 1, 3. hafta | Crystal Runner (pilot) — protokol ve skor akışı uçtan uca |
| Faz 1, 3–4. hafta | Orb Surge, Pixel Cascade, ChromaShift (paralel) |
| Faz 2 | Space Defender, Gyroball Infinite + skor limiti kalibrasyonu (Dalga 1 verisiyle) |
| Faz 3 | Tüm canlı oyunlara rewarded/interstitial yerleşimleri |
| Faz 4 | Number Detective (pilot MP), ardından Naval Strike, Tito, Tavla |

---

## 11. Riskler ve Önlemler

| Risk | Önlem |
|---|---|
| Header değişikliği unutulursa oyun platformda boş görünür | CLI ve harness header'ı ilk adımda kontrol eder |
| CrazyGames kaldırılırken oyun akışı bozulur (ör. reklam bekleyen bir `await` hiç dönmez) | Adapter çağrıları her zaman çözülen Promise döndürür; standalone'da reklam çağrıları anında `false` döner; harness tam oyun döngüsünü test eder |
| iOS Safari'de iframe içinde ses/tam ekran kısıtları | İlk dokunuşta `AudioContext.resume()`; tam ekran platform tarafından (iframe'i büyüterek) |
| Gyroball jiroskop izni iframe'de | iframe'e `allow="accelerometer; gyroscope"` + iOS'ta izin isteğini platform butonu tetikler |
| Yanlış skor limitleri meşru oyuncuları engeller | İlk 2 hafta sadece işaretleme modu |
| Açık Ably anahtarları kötüye kullanılır | Faz 0'da hemen iptal/yenile; Dalga 3'te Ably tamamen kaldırılır |
| Oyunların production URL'leri değişir | URL `games/{id}.originUrl`'de tutulur; origin doğrulaması da buradan beslenir |

---

## 12. Senden Gerekenler

1. Her oyunun **production Vercel URL'si** (kendi domain'i varsa o).
2. Oyun repolarına `ayvago-integration` dalı açıp PR oluşturmam için onay.
3. **Battleships repodaki Ably anahtarının** Ably panelinden iptal edilmesi (public repoda düz metin).
4. Kapak görselleri: elinde var mı, yoksa her oyun için oyun içi ekran görüntülerinden otomatik kapak üretelim mi?
