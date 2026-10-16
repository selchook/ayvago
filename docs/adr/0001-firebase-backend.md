# ADR 0001 — Backend olarak Firebase

- Durum: Kabul edildi (2026-10-16)

## Bağlam
Platformun kimlik doğrulama, katalog, skor tablosu, oylama, satın alma yetkileri ve çok oyunculu lobi/sinyalleşme için bir backend'e ihtiyacı var. İlk taslakta Supabase önerilmişti; ürün sahibi Firebase'i seçti.

## Karar
- Auth: Firebase Authentication (anonim giriş → Google/Apple/e-posta ile hesaba yükseltme, aynı uid).
- Kalıcı veri: Cloud Firestore. Anlık veri (presence, lobi, WebRTC sinyalleşme): Realtime Database.
- Sunucu mantığı: Cloud Functions (2nd gen). Gizli anahtarlar Secret Manager'da.
- Bölge: `europe-west1` (Firestore konumu sonradan değiştirilemez).
- Ortamlar: `ayvago-dev` ve `ayvago-prod` ayrı projeler; yerelde Emulator Suite.
- Kurallar her koleksiyon için varsayılan **reddet** ile başlar; her açılım emülatör testiyle gelir.

## Sonuçlar
- Functions için Blaze planı gerekir → bütçe alarmı zorunlu.
- Firestore'da JOIN yok: skor tablosu ilk 100'ü tek belgede önbelleklenir, sıra `count()` ile hesaplanır.
