import type { GameGuide } from '@ayvago/shared';

// Test fixture only: a guide shaped like the ones the studio writes. Real guides arrive in
// content/arcade-guides.json through the catalog sync; this one is never shipped.
export const FIXTURE_GUIDE: GameGuide = {
  about: {
    en: 'Block Drop is a falling-block puzzle in the classic mould. Seven kinds of pieces fall into a well ten squares wide, and you turn and slide each one into place before it lands.\n\nEvery full row you complete disappears and scores points; clearing several rows with one piece scores far more than clearing them one by one. Every ten rows the level rises and the pieces fall faster.\n\nA run ends when the stack reaches the top of the well, so the game is about keeping the board low and tidy while you wait for the right piece.',
    tr: 'Blok Düşür, klasik tarzda bir düşen blok bulmacasıdır. Yedi çeşit parça on kare genişliğindeki bir kuyuya düşer; her birini yere inmeden önce döndürüp yerine kaydırırsın.\n\nTamamladığın her dolu sıra kaybolur ve puan kazandırır; tek parçayla birkaç sıra temizlemek, sıraları tek tek temizlemekten çok daha fazla puan getirir. Her on sırada seviye yükselir ve parçalar daha hızlı düşer.\n\nYığın kuyunun tepesine ulaşınca oyun biter; yani amaç, doğru parçayı beklerken tahtayı alçak ve düzenli tutmaktır.',
  },
  howToPlay: [
    {
      en: 'Watch the next-piece box to see what is coming.',
      tr: 'Sırada ne olduğunu görmek için sonraki parça kutusuna bak.',
    },
    {
      en: 'Move the falling piece left or right and rotate it to fit the gaps.',
      tr: 'Düşen parçayı sağa sola kaydır ve boşluklara oturması için döndür.',
    },
    {
      en: 'Drop it when it is lined up, to save time.',
      tr: 'Zaman kazanmak için hizalayınca hemen bırak.',
    },
    {
      en: 'Fill whole rows to clear them; four rows at once is a big bonus.',
      tr: 'Sıraları tamamen doldurarak temizle; aynı anda dört sıra büyük bonus getirir.',
    },
  ],
  controls: {
    keyboard: {
      en: 'Left and right arrows move, up rotates, down drops faster, space drops at once, P pauses.',
      tr: 'Sol ve sağ oklar kaydırır, yukarı ok döndürür, aşağı ok hızlandırır, boşluk tuşu anında bırakır, P duraklatır.',
    },
    touch: {
      en: 'Swipe left or right to move, tap to rotate, swipe down to drop.',
      tr: 'Kaydırmak için sağa sola sürükle, döndürmek için dokun, bırakmak için aşağı kaydır.',
    },
  },
  tips: [
    {
      en: 'Keep one column at the edge free for the long piece.',
      tr: 'Uzun parça için kenarda bir sütunu boş bırak.',
    },
    {
      en: 'Avoid covering holes; a hole under a block costs you a whole row.',
      tr: 'Boşlukların üstünü kapatma; bir bloğun altında kalan boşluk sana bir sıraya mal olur.',
    },
    {
      en: 'Look at the next piece before you place the current one.',
      tr: 'Elindeki parçayı yerleştirmeden önce sıradakine bak.',
    },
  ],
  features: [
    { en: 'Seven classic piece shapes.', tr: 'Yedi klasik parça şekli.' },
    {
      en: 'Levels that speed up every ten rows.',
      tr: 'Her on sırada hızlanan seviyeler.',
    },
    {
      en: 'Weekly and all-time leaderboards.',
      tr: 'Haftalık ve tüm zamanların skor tabloları.',
    },
  ],
  faq: [
    {
      q: { en: 'Is Block Drop free?', tr: 'Blok Düşür ücretsiz mi?' },
      a: {
        en: 'Yes. It runs in your browser on Ayvago with nothing to install.',
        tr: 'Evet. Ayvago’da tarayıcında çalışır, hiçbir şey kurman gerekmez.',
      },
    },
    {
      // English only: the Turkish page falls back to it.
      q: { en: 'Does every score count?' },
      a: {
        en: 'Scores from finished runs on Normal difficulty go on the leaderboard; Easy runs are practice.',
      },
    },
  ],
};
