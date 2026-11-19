import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuideFile } from '@ayvago/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import committed from '../../content/arcade-guides.json';
import { FIXTURE_GUIDE } from './guides.fixture';

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));

async function loadGuides(file: unknown) {
  vi.resetModules();
  vi.doMock('../../content/arcade-guides.json', () => ({ default: file }));
  return import('./guides');
}

describe('committed guide file', () => {
  it('parses, and every guide belongs to a catalog game', async () => {
    const file = parseGuideFile(committed);
    const { getAllGames } = await import('./index');
    const slugs = new Set(getAllGames().map((game) => game.slug));
    for (const slug of Object.keys(file.guides)) expect(slugs, slug).toContain(slug);
  });
});

describe('game guides', () => {
  afterEach(() => {
    vi.doUnmock('../../content/arcade-guides.json');
  });

  it('finds a guide by slug and nothing for other slugs', async () => {
    const guides = await loadGuides({ version: 1, guides: { 'block-drop': FIXTURE_GUIDE } });
    expect(guides.getGameGuide('block-drop')).toEqual(FIXTURE_GUIDE);
    expect(guides.getGameGuide('space-blaster')).toBeNull();
    // Object keys of the record itself, never inherited ones.
    expect(guides.getGameGuide('constructor')).toBeNull();
    expect(guides.guideSlugs()).toEqual(['block-drop']);
  });

  it('refuses an invalid file', async () => {
    const guides = await loadGuides({ version: 1, guides: { 'block-drop': { about: {} } } });
    expect(() => guides.getGameGuide('block-drop')).toThrow();
  });

  it('localizes a guide, falling back to English', async () => {
    const { localizeGuide } = await loadGuides({ version: 1, guides: {} });
    const tr = localizeGuide(FIXTURE_GUIDE, 'tr');
    expect(tr.about).toHaveLength(3);
    expect(tr.about[0]).toMatch(/^Blok Düşür, klasik/);
    expect(tr.howToPlay).toHaveLength(4);
    expect(tr.controls.map((row) => row.input)).toEqual(['keyboard', 'touch']);
    expect(tr.faq[0]!.q).toBe('Blok Düşür ücretsiz mi?');
    expect(tr.faq[1]!.q).toBe('Does every score count?');

    const en = localizeGuide(FIXTURE_GUIDE, 'en');
    expect(en.about[1]).toMatch(/^Every full row/);
    expect(en.features).toHaveLength(3);
  });

  it('splits paragraphs at blank lines only and leaves out empty ones', async () => {
    const { localizeGuide } = await loadGuides({ version: 1, guides: {} });
    const about = { en: 'One\nstill one.\n\n  \n\nTwo.\n \nThree.' };
    expect(localizeGuide({ ...FIXTURE_GUIDE, about }, 'en').about).toEqual([
      'One\nstill one.',
      'Two.',
      'Three.',
    ]);
  });

  it('gives empty lists for the optional sections', async () => {
    const { localizeGuide, faqJsonLd } = await loadGuides({ version: 1, guides: {} });
    const { features: _f, faq: _q, ...rest } = FIXTURE_GUIDE;
    const localized = localizeGuide(rest, 'en');
    expect(localized.features).toEqual([]);
    expect(localized.faq).toEqual([]);
    expect(faqJsonLd(localized.faq, 'en', 'https://ayvago.com/en/games/block-drop')).toBeNull();
  });

  it('builds FAQPage data and keeps it inert inside a script tag', async () => {
    const { faqJsonLd, jsonLdScript } = await loadGuides({ version: 1, guides: {} });
    const data = faqJsonLd([{ q: 'Is it </script> safe?', a: 'Yes <b>.' }], 'en', 'https://x/');
    expect(data).toMatchObject({
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is it </script> safe?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes <b>.' },
        },
      ],
    });
    const script = jsonLdScript(data);
    expect(script).not.toContain('<');
    expect(JSON.parse(script)).toEqual(data);
  });
});

// The guide file grows with every game, so it stays out of browser bundles: only server code may
// import it (docs/adr/0027-game-guides-as-page-content.md).
describe('guides stay on the server', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      if (name === 'node_modules' || name.startsWith('.')) return [];
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it('no client component and not the shared catalog index imports them', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap((dir) => sourceFiles(join(WEB_ROOT, dir)))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        const client = /^\s*['"]use client['"]/.test(source) || path.endsWith('catalog/index.ts');
        return client && /catalog\/guides|arcade-guides\.json|from '\.\/guides'/.test(source);
      })
      .map((path) => relative(WEB_ROOT, path));
    expect(offenders).toEqual([]);
  });
});
