import { describe, expect, it } from 'vitest';
import { gameGuideSchema, GUIDE_INPUTS, parseGuideFile, type GameGuide } from './guide';

const t = (en: string, tr?: string) => (tr ? { en, tr } : { en });

const guide: GameGuide = {
  about: t('First paragraph.\n\nSecond paragraph.', 'İlk paragraf.\n\nİkinci paragraf.'),
  howToPlay: [t('Step one.'), t('Step two.'), t('Step three.')],
  controls: { keyboard: t('Arrow keys move.', 'Ok tuşları hareket ettirir.') },
  tips: [t('Tip one.'), t('Tip two.'), t('Tip three.')],
  features: [t('Feature one.'), t('Feature two.')],
  faq: [
    { q: t('Is it free?'), a: t('Yes.') },
    { q: t('Does it save?'), a: t('Your best score is kept.') },
  ],
};

function issues(input: unknown): string[] {
  const result = gameGuideSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('game guides', () => {
  it('accepts a full guide and one without the optional sections', () => {
    expect(issues(guide)).toEqual([]);
    const { features: _features, faq: _faq, ...minimal } = guide;
    expect(issues(minimal)).toEqual([]);
  });

  it('requires English text and allows Turkish only as an optional extra', () => {
    expect(issues({ ...guide, about: { tr: 'Sadece Türkçe.' } })).toContain('about.en');
    expect(issues({ ...guide, about: { en: 'Text.', de: 'Text.' } })).not.toEqual([]);
    expect(issues({ ...guide, about: { en: '   ' } })).toContain('about.en');
  });

  it('keeps the list sizes inside their limits', () => {
    expect(issues({ ...guide, howToPlay: guide.howToPlay.slice(0, 2) })).toContain('howToPlay');
    expect(issues({ ...guide, tips: Array(9).fill(t('Tip.')) })).toContain('tips');
    expect(issues({ ...guide, features: [t('Only one.')] })).toContain('features');
    expect(issues({ ...guide, faq: guide.faq!.slice(0, 1) })).toContain('faq');
  });

  it('limits the length of each text', () => {
    expect(issues({ ...guide, tips: [t('x'.repeat(501)), ...guide.tips] })).toContain('tips.0.en');
    expect(issues({ ...guide, about: t('x'.repeat(2001)) })).toContain('about.en');
    const longQuestion = [{ q: t('x'.repeat(201)), a: t('Yes.') }, guide.faq![1]];
    expect(issues({ ...guide, faq: longQuestion })).toContain('faq.0.q.en');
  });

  it('needs at least one known input in the controls', () => {
    expect(issues({ ...guide, controls: {} })).toContain('controls');
    expect(issues({ ...guide, controls: { gyroscope: t('Tilt.') } })).not.toEqual([]);
    expect(GUIDE_INPUTS).toEqual(['keyboard', 'touch', 'mouse', 'gamepad']);
  });

  it('rejects unknown keys', () => {
    expect(issues({ ...guide, intro: t('Extra.') })).not.toEqual([]);
  });

  it('parses a guide file keyed by slug', () => {
    const file = parseGuideFile({ version: 1, guides: { 'block-drop': guide } });
    expect(Object.keys(file.guides)).toEqual(['block-drop']);
    expect(parseGuideFile({ version: 1, guides: {} }).guides).toEqual({});
  });

  it('rejects a file with another version or a malformed slug', () => {
    expect(() => parseGuideFile({ version: 2, guides: {} })).toThrow();
    expect(() => parseGuideFile({ version: 1, guides: { 'Block Drop': guide } })).toThrow();
    expect(() => parseGuideFile({ version: 1, guides: { 'block-drop-': guide } })).toThrow();
    expect(() => parseGuideFile({ version: 1 })).toThrow();
  });
});
