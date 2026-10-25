import type { AvatarGlyph } from '@/lib/account/avatars';

// White glyphs for preset avatars, drawn on a 24×24 grid. "currentColor" details (eyes,
// windows) take the disc color so they read as cut-outs.
const GLYPHS: Record<AvatarGlyph, React.ReactNode> = {
  star: <path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z" />,
  heart: <path d="M12 21s-8-5.1-8-11a4.6 4.6 0 0 1 8-3.1A4.6 4.6 0 0 1 20 10c0 5.9-8 11-8 11z" />,
  bolt: <path d="M13.5 2 4.5 13.5h6.2L9.5 22l9-11.5h-6.2z" />,
  crown: <path d="M3 7.5l4.5 4L12 4l4.5 7.5 4.5-4-2 11.5H5z" />,
  rocket: (
    <>
      <path d="M12 2c3.3 2.2 5 6 5 10.2l-1.6 3.3H8.6L7 12.2C7 8 8.7 4.2 12 2z" />
      <path d="M8.3 14.5 5 17.8V21l3.7-2.4zM15.7 14.5l3.3 3.3V21l-3.7-2.4zM10.5 17h3l-.6 4h-1.8z" />
      <circle cx="12" cy="9.5" r="1.8" fill="currentColor" />
    </>
  ),
  gamepad: (
    <>
      <path d="M7 7h10a5 5 0 0 1 5 5v.6a3.4 3.4 0 0 1-6 2.2L14.6 13H9.4L8 14.8a3.4 3.4 0 0 1-6-2.2V12a5 5 0 0 1 5-5z" />
      <path d="M6.2 10.5h1.6v-1.6h1.4v1.6h1.6v1.4H9.2v1.6H7.8v-1.6H6.2z" fill="currentColor" />
      <circle cx="16" cy="10.2" r="1" fill="currentColor" />
      <circle cx="17.8" cy="12" r="1" fill="currentColor" />
    </>
  ),
  planet: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M2.5 16.5c-1-1.8 3.2-5 9.2-7.3s11-2.7 11.8-1l-1.8.9c-.8-.6-4.3 0-9.3 2S4.6 15.3 4.4 16z" />
    </>
  ),
  flame: (
    <path d="M12 2c.7 3.6 5.5 5.8 5.5 11.5a5.5 5.5 0 0 1-11 0c0-2.8 1.5-4.6 2.8-6.3.3 2.4 1.6 3.6 2.9 3.8-.6-3.2-.8-5.8-.2-9z" />
  ),
  leaf: (
    <>
      <path d="M4.5 19.5C4.5 9.8 10.5 4 20 4c0 9.6-5.8 15.5-15.5 15.5z" />
      <path d="M5 19 14 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  gem: (
    <>
      <path d="M6.5 3.5h11L22 9.5 12 21 2 9.5z" />
      <path
        d="M2.8 9.5h18.4M9.5 3.8 12 9.5l2.5-5.7M12 9.5V20"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </>
  ),
  moon: <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />,
  ghost: (
    <>
      <path d="M5 21V10.5a7 7 0 0 1 14 0V21l-2.3-1.8-2.4 1.8-2.3-1.8-2.3 1.8-2.4-1.8z" />
      <circle cx="9.5" cy="10.5" r="1.4" fill="currentColor" />
      <circle cx="14.5" cy="10.5" r="1.4" fill="currentColor" />
    </>
  ),
};

export function AvatarGlyphIcon({ glyph, size }: { glyph: AvatarGlyph; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#fff"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[glyph]}
    </svg>
  );
}
