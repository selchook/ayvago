# ADR 0003 — WebRTC relay için Cloudflare Realtime TURN

- Durum: Kabul edildi (2026-10-16)

## Bağlam
Çok oyunculu oyunlar (Tavla, Naval Strike, Number Detective, Tito) bugün Ably kullanıyor ve Ably anahtarları istemcide açıkta. Platform kendi çok oyunculu katmanını kuracak; NAT/CGNAT arkasındaki oyuncular için TURN gerekli.

## Karar
- Bağlantıyı platform (üst sayfa) kurar: WebRTC DataChannel, sinyalleşme Firebase Realtime Database üzerinden.
- TURN: Cloudflare Realtime TURN. Kısa ömürlü ICE kimlik bilgileri `getIceServers` Cloud Function'ı ile
  `rtc.live.cloudflare.com/v1/turn/keys/{KEY_ID}/credentials/generate-ice-servers` ucundan üretilir; token Secret Manager'da.
- Port 53 URL'leri istemciye verilmeden filtrelenir.
- WebRTC kurulamazsa hamleler RTDB üzerinden aktarılır (yedek kanal).

## Sonuçlar
- Maliyet: aylık ilk 1.000 GB ücretsiz, sonrası ~$0.05/GB (uygulama sırasında güncel fiyat teyit edilecek).
- Ably bağımlılığı Dalga 3'te tamamen kaldırılır.
