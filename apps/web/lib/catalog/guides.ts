import {
  GUIDE_INPUTS,
  parseGuideFile,
  pickLocalized,
  type GameGuide,
  type GuideFile,
  type GuideInput,
  type Locale,
} from '@ayvago/shared';
import guideFile from '../../content/arcade-guides.json';

// Game guides (slice 3.5, docs/adr/0027-game-guides-as-page-content.md): the long-form text of a
// game page, written by the studio and synced into content/arcade-guides.json with the catalog.
//
// Server only. The file grows with every guide, so it must never reach a browser bundle: this
// module is not re-exported from lib/catalog/index.ts (client components import that one), and a
// test fails if a client component imports it. The Cloud Functions never see it either; it lives
// in the web app, not in packages/shared.

/** Parsed once per server process; an invalid file fails the build instead of a page. */
let parsed: GuideFile | null = null;

function guides(): GuideFile['guides'] {
  parsed ??= parseGuideFile(guideFile);
  return parsed.guides;
}

/** The guide of a catalog game, or null while the studio has not written one. */
export function getGameGuide(slug: string): GameGuide | null {
  return Object.hasOwn(guides(), slug) ? guides()[slug]! : null;
}

/** Slugs that have a guide. */
export function guideSlugs(): string[] {
  return Object.keys(guides());
}

/** A guide's text in one locale, English where the locale has none. */
export type LocalizedGuide = {
  /** The about text split into paragraphs at blank lines. */
  about: string[];
  howToPlay: string[];
  /** One row per input the guide describes, in a fixed order. */
  controls: { input: GuideInput; text: string }[];
  tips: string[];
  features: string[];
  faq: { q: string; a: string }[];
};

export function localizeGuide(guide: GameGuide, locale: Locale): LocalizedGuide {
  const pick = (text: { en: string; tr?: string }) => pickLocalized(text, locale);
  return {
    about: pick(guide.about)
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    howToPlay: guide.howToPlay.map(pick),
    controls: GUIDE_INPUTS.flatMap((input) => {
      const text = guide.controls[input];
      return text ? [{ input, text: pick(text) }] : [];
    }),
    tips: guide.tips.map(pick),
    features: (guide.features ?? []).map(pick),
    faq: (guide.faq ?? []).map(({ q, a }) => ({ q: pick(q), a: pick(a) })),
  };
}

/** schema.org FAQPage data for a guide's FAQ, or null without one. */
export function faqJsonLd(faq: LocalizedGuide['faq'], locale: Locale, url: string) {
  if (faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url,
    inLanguage: locale,
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

/** JSON for a `<script type="application/ld+json">`: "<" escaped so the text stays inert. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
