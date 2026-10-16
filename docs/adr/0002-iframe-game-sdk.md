# ADR 0002 — Oyunlar iframe + postMessage SDK ile entegre edilir

- Durum: Kabul edildi (2026-10-16)

## Bağlam
GameHub Arena iki model kullanıyordu: `eval()` ile yüklenen tek dosya sınıf modülleri ve iframe + postMessage SDK v1. Ayvago ileride üçüncü taraf oyunları da barındıracak; mevcut oyunlar farklı motorlarda (Phaser, Three.js, React, Canvas).

## Karar
- Sadece iframe modeli. `eval()` modeli bırakıldı (platform sayfasında yabancı kod çalıştırmak güvenlik riski).
- SDK v2, v1 mesaj isimleriyle (`GHA_READY`, `GHA_START`, `GHA_END`, `GHA_SCORE`, `GHA_MOVE_IN/OUT`…) geriye uyumlu.
- Platform her mesajda `event.source` ve `event.origin` doğrular; SDK `'*'` yerine izinli platform origin'ine yollar.
- Oyunlar Firebase'e veya Cloudflare'e doğrudan erişmez. Skor, reklam, kullanıcı ve çok oyunculu bağlantı platform üzerinden geçer.
- Oyunlar `ayvago.json` manifesti yayınlar (`packages/shared` içindeki şema).
- CrazyGames entegrasyonu yok; mevcut oyunlardaki CrazyGames SDK'sı import sırasında kaldırılır.

## Sonuçlar
- Oyunların Vercel header'ları `frame-ancestors` ile Ayvago'ya izin vermeli (5 oyunda `X-Frame-Options: SAMEORIGIN` var, düzeltilecek).
- Tarayıcı depolama bölümlemesi nedeniyle oyunların eski localStorage rekorları platforma taşınmaz.
