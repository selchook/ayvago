// The Ayvago Games lockup: the closing frame of the boot intro that every Ayvago Arcade game
// plays (selchook/ayvago-games src/core/intro.ts). Same geometry, in the intro's 1920×1080
// reference units: "AYVAG" with the mark in the O slot, then the red rule and GAMES below.
// Letters, ring and GAMES take the theme's text color (currentColor); the seeds and the rule
// keep the brand red. GAMES and the rule are drawn larger than in the intro so they stay
// legible at top-bar size.

const MARK = 144.48;
const MARK_X = 576.5;
const MARK_Y = -46;
const BRAND_RED = '#ec3013';

export function BrandLogo({ height = 40 }: { height?: number }) {
  return (
    <svg
      viewBox="-645 -180 1300 320"
      height={height}
      width={(height * 1300) / 320}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask
          id="ayvago-logo-letters"
          maskUnits="userSpaceOnUse"
          x="-639.7"
          y="-175.2"
          width="1125.6"
          height="239.7"
          style={{ maskType: 'alpha' }}
        >
          <image
            href="/brand/ayvag.png"
            x="-639.7"
            y="-175.2"
            width="1125.6"
            height="239.7"
            preserveAspectRatio="none"
          />
        </mask>
        <mask
          id="ayvago-logo-games"
          maskUnits="userSpaceOnUse"
          x="2.3"
          y="70.5"
          width="488.9"
          height="64.6"
          style={{ maskType: 'alpha' }}
        >
          <image
            href="/brand/games.png"
            x="2.3"
            y="70.5"
            width="488.9"
            height="64.6"
            preserveAspectRatio="none"
          />
        </mask>
      </defs>
      <rect
        x="-639.7"
        y="-175.2"
        width="1125.6"
        height="239.7"
        fill="currentColor"
        mask="url(#ayvago-logo-letters)"
      />
      <g transform={`translate(${MARK_X} ${MARK_Y})`}>
        <circle r={MARK * 0.4197} fill="none" stroke="currentColor" strokeWidth={MARK * 0.15} />
        {[0, 1, 2, 3, 4].map((i) => (
          <ellipse
            key={i}
            cx="0"
            cy={-MARK * 0.19}
            rx={MARK * 0.053}
            ry={MARK * 0.0863}
            fill={BRAND_RED}
            transform={`rotate(${72 * i})`}
          />
        ))}
      </g>
      <rect x="-361" y="100" width="332" height="8" fill={BRAND_RED} />
      <rect
        x="2.3"
        y="70.5"
        width="488.9"
        height="64.6"
        fill="currentColor"
        mask="url(#ayvago-logo-games)"
      />
    </svg>
  );
}
