import type { GameManifest } from '@ayvago/shared';
import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import tr from '../../messages/tr.json';
import { localizeGuide } from '@/lib/catalog/guides';
import { FIXTURE_GUIDE } from '@/lib/catalog/guides.fixture';

// The written guide as server HTML (slice 3.5): every section's text is in the markup itself,
// not loaded later, so readers and crawlers get it with the page.

const catalogs = { en, tr } as const;
let locale: 'en' | 'tr' = 'en';
vi.mock('next-intl/server', () => ({
  getTranslations: async () => createTranslator({ locale, messages: catalogs[locale] }),
}));

async function render(lang: 'en' | 'tr', inputs: GameManifest['input'] = ['keyboard', 'touch']) {
  locale = lang;
  const { GameGuide } = await import('./game-guide');
  const element = await GameGuide({
    guide: localizeGuide(FIXTURE_GUIDE, lang),
    description: 'Lead paragraph from the manifest.',
    inputs,
  });
  return renderToStaticMarkup(element);
}

describe('GameGuide', () => {
  it('renders every section with its heading and text', async () => {
    const html = await render('en');
    for (const heading of [
      'About this game',
      'How to play',
      'Controls',
      'Tips',
      'Features',
      'Frequently asked questions',
    ]) {
      expect(html, heading).toContain(`>${heading}</h2>`);
    }
    expect(html).toContain('Lead paragraph from the manifest.');
    // Three about paragraphs after the lead, steps as an ordered list.
    expect(html.match(/<p>/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('<ol');
    expect(html).toContain('Move the falling piece left or right');
    expect(html).toContain('<dt>Keyboard</dt>');
    expect(html).toContain('<dt>Touch</dt>');
    expect(html).toContain('<h3>Is Block Drop free?</h3>');
    expect(html).toContain('Yes. It runs in your browser');
  });

  it('uses Turkish text and labels, with English where a text has no Turkish', async () => {
    const html = await render('tr');
    expect(html).toContain('>Nasıl oynanır</h2>');
    expect(html).toContain('<dt>Klavye</dt>');
    expect(html).toContain('<h3>Blok Düşür ücretsiz mi?</h3>');
    expect(html).toContain('<h3>Does every score count?</h3>');
  });

  it('keeps inputs the guide does not describe as chips', async () => {
    const html = await render('en', ['keyboard', 'touch', 'gamepad']);
    expect(html).toContain('aria-label="Other controls"');
    expect(html).toContain('<li>Gamepad</li>');
    expect(await render('en')).not.toContain('Other controls');
  });
});
