// The Ayvago Games lockup: the closing frame of the boot intro that every Ayvago Arcade game
// plays (selchook/ayvago-games src/core/intro.ts). Same geometry, in the intro's 1920×1080
// reference units: "AYVAG" with the mark in the O slot, then the red rule and GAMES below.
// Letters, ring and GAMES take the theme's text color (currentColor); the seeds and the rule
// keep the brand red. GAMES and the rule are drawn larger than in the intro so they stay
// legible at top-bar size.
// In the pixel themes (retro, arcade) the word and the mark are pixelated by the SVG filter
// below, switched on from shell.module.css: each block takes the color sampled at its center.
// GAMES stays crisp: at top-bar size it is only a few blocks tall.

const MARK = 144.48;
const MARK_X = 576.5;
const MARK_Y = -46;
const BRAND_RED = '#ec3013';
// The view box; the filters tile blocks from its corner.
const VIEW = { x: -645, y: -180, width: 1300, height: 320 };

/**
 * Pixelation filter with square blocks of `block` view-box units (8 units = 1 CSS pixel at
 * the default height): sample one pixel-sized square at each block's center, then grow it to
 * fill the block.
 */
function PixelFilter({ id, block }: { id: string; block: number }) {
  const sample = 8;
  const offset = (block - sample) / 2;
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      x={VIEW.x}
      y={VIEW.y}
      width={VIEW.width}
      height={VIEW.height}
      colorInterpolationFilters="sRGB"
    >
      <feFlood x={VIEW.x + offset} y={VIEW.y + offset} width={sample} height={sample} />
      <feComposite x={VIEW.x} y={VIEW.y} width={block} height={block} />
      <feTile result="grid" />
      <feComposite in="SourceGraphic" in2="grid" operator="in" />
      <feMorphology operator="dilate" radius={offset} />
    </filter>
  );
}

export function BrandLogo({ height = 40 }: { height?: number }) {
  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
      height={height}
      width={(height * VIEW.width) / VIEW.height}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <PixelFilter id="ayvago-pixel" block={24} />
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
      <g data-pixel>
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
