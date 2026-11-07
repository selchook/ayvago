import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildThemeCss } from '@ayvago/themes';
import { describe, expect, it } from 'vitest';

// Every var(--name) in the web app's stylesheets must name a custom property that something
// defines: the theme CSS (packages/themes), a declaration in a stylesheet, or an inline style set
// from a component. An undefined name silently falls back to the inherited value, which is how
// `var(--accent-2)` (the token is `accent2`, emitted as `--accent2`) went unnoticed.

const WEB_ROOT = join(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib'];

function filesUnder(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path, ext);
    return ext.test(entry.name) ? [path] : [];
  });
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[1] as string);
}

const sources = SOURCE_DIRS.flatMap((dir) => filesUnder(join(WEB_ROOT, dir), /\.(css|tsx?)$/));
const stylesheets = sources.filter((file) => file.endsWith('.css'));

const defined = new Set<string>([
  ...matches(buildThemeCss(), /(--[\w-]+)\s*:/g),
  ...stylesheets.flatMap((file) => matches(readFileSync(file, 'utf8'), /(--[\w-]+)\s*:/g)),
  ...sources
    .filter((file) => /\.tsx?$/.test(file))
    .flatMap((file) => matches(readFileSync(file, 'utf8'), /['"](--[\w-]+)['"]\s*:/g)),
]);

describe('CSS custom properties', () => {
  it('finds the stylesheets and the theme tokens', () => {
    expect(stylesheets.length).toBeGreaterThan(0);
    expect(defined).toContain('--accent2');
  });

  it('only references custom properties that are defined', () => {
    const undefinedRefs = stylesheets.flatMap((file) =>
      matches(readFileSync(file, 'utf8'), /var\(\s*(--[\w-]+)/g)
        .filter((name) => !defined.has(name))
        .map((name) => `${relative(WEB_ROOT, file)}: ${name}`),
    );
    expect(undefinedRefs).toEqual([]);
  });
});
