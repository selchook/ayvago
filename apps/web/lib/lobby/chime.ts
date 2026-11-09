'use client';

// A soft two-note chime for an incoming invite, made with Web Audio (no sound file to load).
// Browsers only allow sound after the player has interacted with the page; before that it stays
// silent rather than logging autoplay warnings.

let context: AudioContext | null = null;

export function playInviteChime(): void {
  try {
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    if (activation && !activation.hasBeenActive) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    const ctx = context;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    const start = ctx.currentTime + 0.02;
    // E6 then A6, each a short sine with a soft attack and a long fade.
    [1318.5, 1760].forEach((frequency, i) => {
      const at = start + i * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.06, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.5);
    });
  } catch {
    // Sound is a nicety; the toast and the bell carry the invite.
  }
}
